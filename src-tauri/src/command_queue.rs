// tb_1792536109_79489_5 — очередь команд агента файлом (inbox/ + ack/).
//
// Разведка RECON_PLAYER_FOR_AGENT_2026-10-21 §3, вариант B: у файловой
// очереди нет ни порта, ни сетевой поверхности — только права файловой
// системы. Rust-сторона делает всё, что можно проверить без окна:
// разбирает <id>.cmd.json, отбрасывает просроченные и чужие пути, пишет
// ack на структурные ошибки и отдаёт валидную команду фронтенду событием
// vetka-command. Исполнение глаголов и ack на результат — в App.
//
// Идемпотентность: команда с уже существующим <id>.ack.json не
// переотправляется; после ack cmd-файл уезжает в inbox/done/ (аудит).
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

pub const QUEUE_VERSION: u32 = 1;
pub const POLL_INTERVAL_MS: u64 = 500;
pub const EVENT_NAME: &str = "vetka-command";
/// Пока ack не появился, команду повторяем не чаще этого интервала:
/// первый emit может прийтись на момент, когда WebView ещё не подписан.
const RESEND_AFTER_MS: u64 = 1500;

/// Глаголы шага 2 (разведка §6 п.2). ini-inline плейлиста идёт через
/// open_playlist: args.path ИЛИ args.entries (создание плейлиста с in-out).
pub const VERBS: &[&str] = &[
    "open_playlist",
    "open_file",
    "seek",
    "play_range",
    "next",
    "pause",
];

#[derive(Debug, Clone, Serialize)]
pub struct QueuePaths {
    pub root: String,
    pub inbox: String,
    pub ack: String,
    pub playlists: String,
    pub done: String,
    pub poll_interval_ms: u64,
    pub cmd_version: u32,
    pub verbs: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
struct CommandEvent {
    cmd_path: String,
    ack_path: String,
    playlists_dir: String,
    cmd: Value,
}

#[derive(Debug, Clone, PartialEq)]
struct CmdError {
    code: String,
    message: String,
}

impl CmdError {
    fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
        }
    }
}

#[derive(Debug)]
enum Validation {
    Valid(Value),
    Expired(Value),
    Invalid(CmdError),
}

pub fn queue_paths(app: &AppHandle) -> Result<QueuePaths, String> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app data dir unavailable: {e}"))?;
    Ok(paths_for(&root))
}

fn paths_for(root: &Path) -> QueuePaths {
    QueuePaths {
        root: root.display().to_string(),
        inbox: root.join("inbox").display().to_string(),
        ack: root.join("ack").display().to_string(),
        playlists: root.join("playlists").display().to_string(),
        done: root.join("inbox").join("done").display().to_string(),
        poll_interval_ms: POLL_INTERVAL_MS,
        cmd_version: QUEUE_VERSION,
        verbs: VERBS.iter().map(|v| v.to_string()).collect(),
    }
}

/// Создаёт каталоги очереди и запускает поллер. Ошибки только логируются:
/// без очереди плеер работает как раньше (человеком).
pub fn start(app: AppHandle) {
    let paths = match queue_paths(&app) {
        Ok(paths) => paths,
        Err(err) => {
            eprintln!("[Mark Player] command queue unavailable: {err}");
            return;
        }
    };
    for dir in [&paths.inbox, &paths.ack, &paths.playlists, &paths.done] {
        if let Err(err) = fs::create_dir_all(dir) {
            eprintln!("[Mark Player] command queue dir {dir}: {err}");
            return;
        }
    }
    let roots = allowed_roots();
    let seen: Arc<Mutex<HashMap<String, Instant>>> = Arc::new(Mutex::new(HashMap::new()));
    let poll_paths = paths.clone();
    let spawned = thread::Builder::new()
        .name("mark-command-queue".to_string())
        .spawn(move || loop {
            poll_once(&app, &poll_paths, &roots, &seen);
            thread::sleep(Duration::from_millis(POLL_INTERVAL_MS));
        });
    if let Err(err) = spawned {
        eprintln!("[Mark Player] command queue thread failed: {err}");
    }
}

/// Что делать с найденным <id>.cmd.json на этом проходе. Вынесено из
/// poll_once, чтобы идемпотентность проверялась без AppHandle.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PollAction {
    /// ack уже есть — команда исполнена, файл уходит в done/ без emit.
    Done,
    /// emit был недавно, ack ещё не появился — ждём, не дублируем.
    Throttled,
    /// Можно разбирать и отдавать в App.
    Submit,
}

fn poll_action(ack_exists: bool, last_emit: Option<Instant>, now: Instant) -> PollAction {
    if ack_exists {
        return PollAction::Done;
    }
    if let Some(at) = last_emit {
        if now.saturating_duration_since(at) < Duration::from_millis(RESEND_AFTER_MS) {
            return PollAction::Throttled;
        }
    }
    PollAction::Submit
}

fn poll_once(
    app: &AppHandle,
    paths: &QueuePaths,
    roots: &[PathBuf],
    seen: &Arc<Mutex<HashMap<String, Instant>>>,
) {
    let inbox = Path::new(&paths.inbox);
    let ack_dir = Path::new(&paths.ack);
    let done_dir = Path::new(&paths.done);
    let entries = match fs::read_dir(inbox) {
        Ok(entries) => entries,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        let Some(stem) = name.strip_suffix(".cmd.json") else {
            continue;
        };
        if stem.is_empty() {
            continue;
        }
        let ack_path = ack_dir.join(format!("{stem}.ack.json"));
        let last_emit = seen.lock().ok().and_then(|s| s.get(stem).copied());
        match poll_action(ack_path.exists(), last_emit, Instant::now()) {
            PollAction::Done => {
                // Команда исполнена — убираем из inbox, ack остаётся аудитом.
                let _ = seen.lock().map(|mut s| s.remove(stem));
                let _ = fs::rename(&path, done_dir.join(name));
                continue;
            }
            PollAction::Throttled => continue,
            PollAction::Submit => {}
        }
        let raw = match fs::read_to_string(&path) {
            Ok(raw) => raw,
            Err(err) => {
                let _ = write_ack(
                    ack_dir,
                    stem,
                    None,
                    "error",
                    Some(CmdError::new("unreadable_command", err.to_string())),
                );
                mark_done(&path, done_dir, name, seen, stem);
                continue;
            }
        };
        match validate_command(stem, &raw, roots, now_ms()) {
            Validation::Valid(cmd) => {
                let payload = CommandEvent {
                    cmd_path: path.display().to_string(),
                    ack_path: ack_path.display().to_string(),
                    playlists_dir: paths.playlists.clone(),
                    cmd,
                };
                if let Err(err) = app.emit(EVENT_NAME, payload) {
                    eprintln!("[Mark Player] command queue emit failed: {err}");
                    continue;
                }
                if let Ok(mut s) = seen.lock() {
                    s.insert(stem.to_string(), Instant::now());
                }
            }
            Validation::Expired(cmd) => {
                let verb = cmd.get("verb").and_then(Value::as_str).map(str::to_string);
                let _ = write_ack(
                    ack_dir,
                    stem,
                    verb.as_deref(),
                    "expired",
                    Some(CmdError::new(
                        "expired",
                        "команда истекла до исполнения (expires_at в прошлом)",
                    )),
                );
                mark_done(&path, done_dir, name, seen, stem);
            }
            Validation::Invalid(err) => {
                let verb = serde_json::from_str::<Value>(&raw)
                    .ok()
                    .and_then(|v| v.get("verb").and_then(Value::as_str).map(str::to_string));
                let _ = write_ack(ack_dir, stem, verb.as_deref(), "error", Some(err));
                mark_done(&path, done_dir, name, seen, stem);
            }
        }
    }
}

fn mark_done(
    path: &Path,
    done_dir: &Path,
    name: &str,
    seen: &Arc<Mutex<HashMap<String, Instant>>>,
    stem: &str,
) {
    let _ = fs::rename(path, done_dir.join(name));
    if let Ok(mut s) = seen.lock() {
        s.insert(stem.to_string(), Instant::now());
    }
}

fn write_ack(
    ack_dir: &Path,
    id: &str,
    verb: Option<&str>,
    status: &str,
    error: Option<CmdError>,
) -> io::Result<()> {
    let mut body = json!({
        "ack_version": QUEUE_VERSION,
        "id": id,
        "verb": verb,
        "status": status,
        "at": rfc3339_now(),
    });
    if let Some(err) = error {
        body["error"] = json!({ "code": err.code, "message": err.message });
    }
    let text = serde_json::to_string_pretty(&body).unwrap_or_else(|_| "{}".to_string());
    let target = ack_dir.join(format!("{id}.ack.json"));
    let tmp = ack_dir.join(format!(".{id}.ack.tmp"));
    fs::write(&tmp, text)?;
    fs::rename(tmp, target)
}

/// Валидация одного файла команды. Чистая (кроме чтения файловой системы
/// для canonicalize), тестируется на temp-каталогах.
fn validate_command(stem: &str, raw: &str, roots: &[PathBuf], now: i64) -> Validation {
    let parsed: Value = match serde_json::from_str(raw) {
        Ok(value) => value,
        Err(err) => {
            return Validation::Invalid(CmdError::new("invalid_json", format!("не JSON: {err}")))
        }
    };
    let Some(obj) = parsed.as_object() else {
        return Validation::Invalid(CmdError::new(
            "invalid_command",
            "команда должна быть объектом",
        ));
    };
    let version = obj.get("cmd_version").and_then(Value::as_u64);
    match version {
        Some(v) if v == QUEUE_VERSION as u64 => {}
        Some(v) => {
            return Validation::Invalid(CmdError::new(
                "unsupported_version",
                format!("cmd_version={v}, ожидается {QUEUE_VERSION}"),
            ))
        }
        None => {
            return Validation::Invalid(CmdError::new("invalid_command", "нет cmd_version (число)"))
        }
    }
    let id = obj.get("id").and_then(Value::as_str).unwrap_or("");
    if !valid_queue_id(id) || id != stem {
        return Validation::Invalid(CmdError::new(
            "invalid_id",
            format!(
                "id={id:?} должен совпадать с именем файла {stem:?} и быть [A-Za-z0-9][A-Za-z0-9._-]{{0,127}}"
            ),
        ));
    }
    let verb = obj.get("verb").and_then(Value::as_str).unwrap_or("");
    if !VERBS.contains(&verb) {
        return Validation::Invalid(CmdError::new(
            "unknown_verb",
            format!("глагол {verb:?} не из очереди шага 2: {}", VERBS.join(", ")),
        ));
    }
    if let Some(args) = obj.get("args") {
        if !args.is_object() {
            return Validation::Invalid(CmdError::new("invalid_args", "args должен быть объектом"));
        }
    }
    if let Some(raw_exp) = obj.get("expires_at") {
        let Some(exp) = raw_exp.as_str() else {
            return Validation::Invalid(CmdError::new(
                "invalid_expires_at",
                "expires_at должен быть строкой ISO-8601 UTC",
            ));
        };
        let secs = match parse_rfc3339_secs(exp) {
            Some(secs) => secs,
            None => {
                return Validation::Invalid(CmdError::new(
                    "invalid_expires_at",
                    format!("expires_at={exp:?} не ISO-8601 (пример 2026-10-22T09:00:00Z)"),
                ))
            }
        };
        if secs * 1000 <= now {
            return Validation::Expired(parsed);
        }
    }
    if matches!(verb, "open_playlist" | "open_file") {
        let args = obj.get("args").and_then(Value::as_object);
        let path = args.and_then(|a| a.get("path")).and_then(Value::as_str);
        let inline = args
            .and_then(|a| a.get("entries"))
            .map(Value::is_array)
            .unwrap_or(false);
        match (path, verb) {
            (Some(path), _) => match canonical_media_path(path, roots) {
                Ok(real) => {
                    let mut resolved = parsed.clone();
                    resolved["args"]["path"] = json!(real);
                    return Validation::Valid(resolved);
                }
                Err(err) => return Validation::Invalid(err),
            },
            (None, "open_playlist") if inline => {
                let entries = args
                    .and_then(|a| a.get("entries"))
                    .and_then(Value::as_array)
                    .cloned()
                    .unwrap_or_default();
                if entries.is_empty() {
                    return Validation::Invalid(CmdError::new(
                        "invalid_args",
                        "open_playlist: entries пуст",
                    ));
                }
                let mut resolved = parsed.clone();
                for (index, entry) in entries.iter().enumerate() {
                    let Some(entry_obj) = entry.as_object() else {
                        return Validation::Invalid(CmdError::new(
                            "invalid_args",
                            format!("open_playlist: entries[{index}] не объект"),
                        ));
                    };
                    let Some(path) = entry_obj.get("path").and_then(Value::as_str) else {
                        return Validation::Invalid(CmdError::new(
                            "invalid_args",
                            format!("open_playlist: entries[{index}].path обязателен (строка)"),
                        ));
                    };
                    match canonical_media_path(path, roots) {
                        Ok(real) => resolved["args"]["entries"][index]["path"] = json!(real),
                        Err(err) => return Validation::Invalid(err),
                    }
                }
                return Validation::Valid(resolved);
            }
            _ => {
                return Validation::Invalid(CmdError::new(
                    "invalid_args",
                    format!("{verb}: нужен args.path (или entries для open_playlist)"),
                ))
            }
        }
    }
    Validation::Valid(parsed)
}

/// То же правило, что у JS isQueueId: id — безопасное имя файла, без `..`.
fn valid_queue_id(id: &str) -> bool {
    let bytes = id.as_bytes();
    if bytes.is_empty() || bytes.len() > 128 || id.contains("..") {
        return false;
    }
    bytes[0].is_ascii_alphanumeric()
        && bytes
            .iter()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'-'))
}

fn canonical_media_path(path: &str, roots: &[PathBuf]) -> Result<String, CmdError> {
    let candidate = PathBuf::from(path);
    let real = candidate.canonicalize().map_err(|_| {
        CmdError::new(
            "path_not_found",
            format!("путь не существует или недоступен: {path}"),
        )
    })?;
    if !real.is_file() {
        return Err(CmdError::new(
            "path_not_file",
            format!("не файл: {}", real.display()),
        ));
    }
    if !roots.iter().any(|root| real.starts_with(root)) {
        return Err(CmdError::new(
            "path_forbidden",
            format!(
                "путь вне разрешённых корней ($HOME, /Volumes, $TEMP): {}",
                real.display()
            ),
        ));
    }
    Ok(real.display().to_string())
}

pub fn allowed_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Some(home) = std::env::var_os("HOME") {
        push_canonical(&mut roots, PathBuf::from(home));
    }
    push_canonical(&mut roots, PathBuf::from("/Volumes"));
    push_canonical(&mut roots, std::env::temp_dir());
    roots
}

fn push_canonical(roots: &mut Vec<PathBuf>, candidate: PathBuf) {
    if let Ok(real) = candidate.canonicalize() {
        if !roots.iter().any(|r| r == &real) {
            roots.push(real);
        }
    }
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn rfc3339_now() -> String {
    let secs = now_ms().div_euclid(1000);
    let (y, m, d, hh, mm, ss) = civil_from_epoch(secs);
    format!("{y:04}-{m:02}-{d:02}T{hh:02}:{mm:02}:{ss:02}Z")
}

/// ISO-8601 UTC → секунды эпохи. Поддержаны формы
/// `YYYY-MM-DDTHH:MM:SS[.fff](Z|±HH:MM)`; локальные зоны без смещения
/// отвергаются (fail loud — молча «не истекла» опаснее).
fn parse_rfc3339_secs(raw: &str) -> Option<i64> {
    let s = raw.trim();
    if s.len() < 20 {
        return None;
    }
    let bytes = s.as_bytes();
    if bytes[4] != b'-' || bytes[7] != b'-' || (bytes[10] != b'T' && bytes[10] != b' ') {
        return None;
    }
    if bytes[13] != b':' || bytes[16] != b':' {
        return None;
    }
    let num = |from: usize, to: usize| -> Option<i64> { s.get(from..to)?.parse::<i64>().ok() };
    let year = num(0, 4)?;
    let month = num(5, 7)?;
    let day = num(8, 10)?;
    let hour = num(11, 13)?;
    let minute = num(14, 16)?;
    let second = num(17, 19)?;
    if !(1..=12).contains(&month)
        || !(1..=31).contains(&day)
        || hour > 23
        || minute > 59
        || second > 60
    {
        return None;
    }
    let mut rest = &s[19..];
    if rest.starts_with('.') {
        let frac_len = rest[1..].chars().take_while(|c| c.is_ascii_digit()).count();
        if frac_len == 0 {
            return None;
        }
        rest = &rest[1 + frac_len..];
    }
    let offset = if rest == "Z" || rest == "z" {
        0
    } else {
        let sign = match rest.as_bytes().first() {
            Some(b'+') => 1,
            Some(b'-') => -1,
            _ => return None,
        };
        let body = &rest[1..];
        if body.len() != 5 || body.as_bytes()[2] != b':' {
            return None;
        }
        let oh = body.get(0..2)?.parse::<i64>().ok()?;
        let om = body.get(3..5)?.parse::<i64>().ok()?;
        sign * (oh * 3600 + om * 60)
    };
    Some(days_from_civil(year, month, day) * 86400 + hour * 3600 + minute * 60 + second - offset)
}

/// Гражданская дата → дни от 1970-01-01 (Howard Hinnant, era-based).
fn days_from_civil(y: i64, m: i64, d: i64) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146097 + doe - 719468
}

fn civil_from_epoch(secs: i64) -> (i64, i64, i64, i64, i64, i64) {
    let days = secs.div_euclid(86400);
    let rem = secs.rem_euclid(86400);
    let z = days + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d, rem / 3600, (rem % 3600) / 60, rem % 60)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("mark-queue-{}-{}", std::process::id(), name));
        fs::create_dir_all(&dir).expect("temp dir");
        dir
    }

    fn cmd(id: &str, verb: &str, args: Value) -> String {
        json!({
            "cmd_version": 1,
            "id": id,
            "verb": verb,
            "args": args,
            "created_at": "2026-10-21T20:00:00Z"
        })
        .to_string()
    }

    #[test]
    fn accepts_valid_media_path_inside_root() {
        let root = temp_root("ok");
        let media = root.join("a.mp4");
        fs::write(&media, b"x").unwrap();
        let raw = cmd(
            "c1",
            "open_file",
            json!({ "path": media.display().to_string() }),
        );
        match validate_command("c1", &raw, &[root.canonicalize().unwrap()], now_ms()) {
            Validation::Valid(v) => {
                assert_eq!(
                    v["args"]["path"],
                    json!(media.canonicalize().unwrap().display().to_string())
                );
            }
            other => panic!("expected valid, got {other:?}"),
        }
    }

    #[test]
    fn rejects_path_outside_roots() {
        let root = temp_root("outside-root");
        let other = temp_root("outside-file");
        let media = other.join("b.mp4");
        fs::write(&media, b"x").unwrap();
        let raw = cmd(
            "c2",
            "open_file",
            json!({ "path": media.display().to_string() }),
        );
        match validate_command("c2", &raw, &[root.canonicalize().unwrap()], now_ms()) {
            Validation::Invalid(err) => assert_eq!(err.code, "path_forbidden"),
            other => panic!("expected forbidden, got {other:?}"),
        }
    }

    #[test]
    fn rejects_missing_path() {
        let root = temp_root("missing");
        let raw = cmd(
            "c3",
            "open_file",
            json!({ "path": root.join("nope.mp4").display().to_string() }),
        );
        match validate_command("c3", &raw, &[root.canonicalize().unwrap()], now_ms()) {
            Validation::Invalid(err) => assert_eq!(err.code, "path_not_found"),
            other => panic!("expected not found, got {other:?}"),
        }
    }

    #[test]
    fn expires_command_in_the_past() {
        let raw = json!({
            "cmd_version": 1,
            "id": "c4",
            "verb": "next",
            "args": {},
            "expires_at": "2020-01-01T00:00:00Z"
        })
        .to_string();
        assert!(matches!(
            validate_command("c4", &raw, &[], now_ms()),
            Validation::Expired(_)
        ));
    }

    #[test]
    fn accepts_future_expiry() {
        let raw = json!({
            "cmd_version": 1,
            "id": "c5",
            "verb": "pause",
            "args": {},
            "expires_at": "2099-01-01T00:00:00Z"
        })
        .to_string();
        assert!(matches!(
            validate_command("c5", &raw, &[], now_ms()),
            Validation::Valid(_)
        ));
    }

    #[test]
    fn rejects_unknown_verb_and_bad_json() {
        let raw = cmd("c6", "shell", json!({}));
        match validate_command("c6", &raw, &[], now_ms()) {
            Validation::Invalid(err) => assert_eq!(err.code, "unknown_verb"),
            other => panic!("expected unknown verb, got {other:?}"),
        }
        match validate_command("c6", "{not json", &[], now_ms()) {
            Validation::Invalid(err) => assert_eq!(err.code, "invalid_json"),
            other => panic!("expected invalid json, got {other:?}"),
        }
    }

    #[test]
    fn rejects_unsafe_id() {
        for (stem, id) in [
            ("..cmd", ".."),
            ("c 7", "c 7"),
            ("c12", "x".repeat(129).as_str()),
        ] {
            let raw = cmd(id, "next", json!({}));
            assert!(
                matches!(validate_command(stem, &raw, &[], now_ms()), Validation::Invalid(ref e) if e.code == "invalid_id"),
                "id {id:?} должен быть отвергнут"
            );
        }
    }

    #[test]
    fn rejects_id_not_matching_file_name() {
        let raw = cmd("other", "next", json!({}));
        match validate_command("c7", &raw, &[], now_ms()) {
            Validation::Invalid(err) => assert_eq!(err.code, "invalid_id"),
            other => panic!("expected invalid id, got {other:?}"),
        }
    }

    #[test]
    fn inline_playlist_needs_no_path() {
        let root = temp_root("inline");
        let media = root.join("x.mp4");
        fs::write(&media, b"x").unwrap();
        let raw = cmd(
            "c8",
            "open_playlist",
            json!({ "entries": [{ "path": media.display().to_string(), "question_id": "q1" }] }),
        );
        match validate_command("c8", &raw, &[root.canonicalize().unwrap()], now_ms()) {
            Validation::Valid(v) => {
                assert_eq!(
                    v["args"]["entries"][0]["path"],
                    json!(media.canonicalize().unwrap().display().to_string())
                );
            }
            other => panic!("expected valid inline playlist, got {other:?}"),
        }
    }

    #[test]
    fn inline_playlist_entry_paths_are_allowlisted() {
        let root = temp_root("inline-root");
        let other = temp_root("inline-outside");
        let media = other.join("b.mp4");
        fs::write(&media, b"x").unwrap();
        let raw = cmd(
            "c10",
            "open_playlist",
            json!({ "entries": [{ "path": media.display().to_string() }] }),
        );
        match validate_command("c10", &raw, &[root.canonicalize().unwrap()], now_ms()) {
            Validation::Invalid(err) => assert_eq!(err.code, "path_forbidden"),
            other => panic!("expected forbidden entry, got {other:?}"),
        }
    }

    #[test]
    fn inline_playlist_rejects_missing_entry_path() {
        for entries in [
            json!([]),
            json!([{ "question_id": "q1" }]),
            json!(["not-an-object"]),
        ] {
            let raw = cmd("c11", "open_playlist", json!({ "entries": entries }));
            match validate_command("c11", &raw, &[], now_ms()) {
                Validation::Invalid(err) => assert_eq!(err.code, "invalid_args"),
                other => panic!("expected invalid args, got {other:?}"),
            }
        }
    }

    #[test]
    fn rejects_open_playlist_without_path_or_entries() {
        let raw = cmd("c9", "open_playlist", json!({}));
        match validate_command("c9", &raw, &[], now_ms()) {
            Validation::Invalid(err) => assert_eq!(err.code, "invalid_args"),
            other => panic!("expected invalid args, got {other:?}"),
        }
    }

    #[test]
    fn parses_rfc3339() {
        assert_eq!(parse_rfc3339_secs("1970-01-01T00:00:00Z"), Some(0));
        assert_eq!(parse_rfc3339_secs("2026-10-21T12:00:00Z"), Some(1792584000));
        assert_eq!(
            parse_rfc3339_secs("2026-10-21T15:00:00+03:00"),
            Some(1792584000)
        );
        assert_eq!(
            parse_rfc3339_secs("2026-10-21T12:00:00.250Z"),
            Some(1792584000)
        );
        assert_eq!(parse_rfc3339_secs("2026-10-21 12:00:00Z"), Some(1792584000));
        assert_eq!(parse_rfc3339_secs("2026-10-21T12:00:00"), None);
        assert_eq!(parse_rfc3339_secs("not a date"), None);
    }

    #[test]
    fn formats_now_as_utc() {
        assert_eq!(civil_from_epoch(0), (1970, 1, 1, 0, 0, 0));
        assert_eq!(civil_from_epoch(1792584000), (2026, 10, 21, 12, 0, 0));
    }

    #[test]
    fn queue_paths_layout() {
        let p = paths_for(Path::new("/tmp/root"));
        assert!(p.inbox.ends_with("inbox"));
        assert!(p.ack.ends_with("ack"));
        assert!(p.playlists.ends_with("playlists"));
        assert!(p.done.ends_with("done"));
        assert_eq!(p.cmd_version, 1);
        assert_eq!(p.verbs.len(), VERBS.len());
    }

    #[test]
    fn ack_exists_means_done_not_resubmit() {
        assert_eq!(poll_action(true, None, Instant::now()), PollAction::Done);
    }

    #[test]
    fn recent_emit_is_throttled_then_resubmitted() {
        let now = Instant::now();
        assert_eq!(poll_action(false, Some(now), now), PollAction::Throttled);
        let later = now + Duration::from_millis(RESEND_AFTER_MS);
        assert_eq!(poll_action(false, Some(now), later), PollAction::Submit);
    }

    #[test]
    fn fresh_command_is_submitted() {
        assert_eq!(poll_action(false, None, Instant::now()), PollAction::Submit);
    }
}
