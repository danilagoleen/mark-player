//! Loopback HTTP server with byte-Range support for media the `asset://`
//! scheme cannot stream.
//!
//! Why: on macOS WKWebView stops issuing content requests for files served
//! through Tauri's custom asset scheme above ~5.2e9 bytes — it fetches `moov`
//! only (duration arrives), never reads `mdat`, and the element stays black
//! without firing `onError`. Measured window: 5 247 132 270 B plays,
//! 5 290 106 592 B does not; `+faststart` makes no difference
//! (docs/217_ph_cut-player/RECON_MARK_PLAYER_LARGE_MEDIA_2026-10-20.md).
//!
//! The same file over `http://127.0.0.1` with Range plays fine, so files at or
//! above the threshold are routed here instead of `asset://`. Since 0.26.11 a
//! second rule routes by bytes per second (size / movie duration from `mvhd`):
//! `asset://` serves ≤1000 KB per request, which a 4K 50p source (≈143 Mbit/s)
//! visibly cannot keep up with. Everything below
//! uses `std` only: no new crates, no FFmpeg, no memory-mapping of the file.
//!
//! Security: the socket is bound to 127.0.0.1, every request must carry the
//! per-run token, and the path must canonicalize under one of the same roots
//! the asset protocol scope allows ($HOME, /Volumes, $TEMP).

use std::io::{self, BufRead, BufReader, Read, Seek, SeekFrom, Write};
use std::net::{Shutdown, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

/// Files at or above this size go through the loopback transport. The window
/// between the last file known to play over `asset://` (5 247 132 270 B) and
/// the first known to fail (5 290 106 592 B) is narrow, so the threshold sits
/// inside it: 5.25e9 keeps the measured working file on the fast path and
/// routes only what is at or past the breakage. Mirrored by BIG_MEDIA_BYTES in
/// src/lib/mediaDiagnostics.ts.
pub const LOOPBACK_MIN_BYTES: u64 = 5_250_000_000;

/// 0.26.11: второе правило — по байтам в секунду, а не по размеру. Tauri-овский
/// `asset://` отдаёт ответ кусками ≤1000 КБ, и каждый кусок — отдельный запрос
/// через веб-вью. 4К 50p с GH5 (≈143 Мбит/с = 17,9 МБ/с) — это ≈18 запросов в
/// секунду, и оператор видел подтормаживание, которого на loopback нет.
/// FullHD той же камеры (≈51 Мбит/с, ≈6 запросов/с) и прокси (≈14 Мбит/с) на
/// `asset://` играют нормально. Порог лежит между ними: 12,5 МБ/с ≈ 100 Мбит/с.
/// Сама граница НЕ измерена (замера на 70–120 Мбит/с нет) — подвинуть по замеру.
pub const LOOPBACK_MIN_BYTES_PER_SEC: u64 = 12_500_000;

/// Правило по битрейту смотрят только у файлов от этого размера: меньше —
/// нечему «не успевать», а разбор moov стоит несколько чтений на каждое открытие.
pub const LOOPBACK_RATE_MIN_FILE_BYTES: u64 = 32 * 1024 * 1024;

const CHUNK: usize = 128 * 1024;
const MAX_HEADER_BYTES: usize = 16 * 1024;

pub struct RangeServer {
    port: u16,
    token: String,
    roots: Vec<PathBuf>,
}

struct Shared {
    token: String,
    roots: Vec<PathBuf>,
}

impl RangeServer {
    /// Binds 127.0.0.1:0 and starts the accept loop on a background thread.
    pub fn start() -> io::Result<Self> {
        let listener = TcpListener::bind(("127.0.0.1", 0))?;
        let port = listener.local_addr()?.port();
        let token = random_token();
        let roots = allowed_roots();
        let shared = Arc::new(Shared {
            token: token.clone(),
            roots: roots.clone(),
        });

        thread::Builder::new()
            .name("mark-media-range".to_string())
            .spawn(move || {
                for incoming in listener.incoming() {
                    let Ok(stream) = incoming else { continue };
                    let shared = Arc::clone(&shared);
                    // One thread per connection: WKWebView opens a handful of
                    // parallel range requests while scrubbing.
                    let _ = thread::Builder::new()
                        .name("mark-media-conn".to_string())
                        .spawn(move || {
                            let _ = serve(stream, &shared);
                        });
                }
            })?;

        Ok(Self { port, token, roots })
    }

    /// URL for a file that needs the loopback transport, or `None` when the
    /// file is small enough for `asset://` (or is not a regular file).
    pub fn url_for(&self, path: &Path) -> Result<Option<String>, String> {
        let meta = match std::fs::metadata(path) {
            Ok(m) => m,
            Err(_) => return Ok(None),
        };
        if !meta.is_file() {
            return Ok(None);
        }
        let len = meta.len();
        // Длительность читаем, только когда она решает дело: размер ещё не
        // отправил файл на loopback, но файл достаточно велик для правила 2.
        let duration = if len >= LOOPBACK_MIN_BYTES || len < LOOPBACK_RATE_MIN_FILE_BYTES {
            None
        } else {
            movie_duration_secs(path)
        };
        if !loopback_wanted(len, duration) {
            return Ok(None);
        }
        if !self.is_allowed(path) {
            return Err(format!("path is outside the media scope: {}", path.display()));
        }
        let encoded = percent_encode(&path.to_string_lossy());
        Ok(Some(format!(
            "http://127.0.0.1:{}/media?t={}&p={}",
            self.port, self.token, encoded
        )))
    }

    fn is_allowed(&self, path: &Path) -> bool {
        let Ok(real) = path.canonicalize() else {
            return false;
        };
        self.roots
            .iter()
            .any(|root| real.starts_with(root.as_path()))
    }
}

/// Нужен ли файлу loopback. Два правила, достаточно любого:
/// 1) размер ≥ `LOOPBACK_MIN_BYTES` — `asset://` не отдаёт mdat (чёрный кадр);
/// 2) файл от `LOOPBACK_RATE_MIN_FILE_BYTES` и размер/длительность ≥
///    `LOOPBACK_MIN_BYTES_PER_SEC` — `asset://` не успевает кусками по 1000 КБ.
/// Длительность неизвестна или нулевая — правило 2 молчит, остаётся правило 1.
fn loopback_wanted(len: u64, duration_secs: Option<f64>) -> bool {
    if len >= LOOPBACK_MIN_BYTES {
        return true;
    }
    if len < LOOPBACK_RATE_MIN_FILE_BYTES {
        return false;
    }
    match duration_secs {
        Some(d) if d.is_finite() && d > 0.0 => {
            len as f64 / d >= LOOPBACK_MIN_BYTES_PER_SEC as f64
        }
        _ => false,
    }
}

/// Длительность фильма в секундах из бокса `mvhd` (MOV/MP4). Всё, что не
/// читается как MOV/MP4 (другой контейнер, обрезанный файл, нулевая длительность
/// или шкала времени), — `None`: решает правило по размеру. Не паникует.
fn movie_duration_secs(path: &Path) -> Option<f64> {
    let mut file = std::fs::File::open(path).ok()?;
    let len = file.metadata().ok()?.len();
    mvhd_duration_secs(&mut file, len)
}

/// Предохранитель от зацикливания на порченых файлах: у камерного MOV верхний
/// уровень — ftyp/wide/mdat/moov, а в moov mvhd идёт первым или почти первым.
const MAX_BOXES: usize = 256;

struct BoxHeader {
    kind: [u8; 4],
    start: u64,
    header_len: u64,
    size: u64,
}

/// Заголовок бокса на `pos`; бокс обязан целиком лежать в `[pos, limit]`.
/// size==1 — 64-битный largesize (mdat больше 4 ГиБ), size==0 — до `limit`.
fn read_box_header<R: Read + Seek>(r: &mut R, pos: u64, limit: u64) -> Option<BoxHeader> {
    if pos.checked_add(8)? > limit {
        return None;
    }
    r.seek(SeekFrom::Start(pos)).ok()?;
    let mut head = [0u8; 8];
    r.read_exact(&mut head).ok()?;
    let small = u32::from_be_bytes([head[0], head[1], head[2], head[3]]) as u64;
    let kind = [head[4], head[5], head[6], head[7]];
    let (size, header_len) = match small {
        0 => (limit - pos, 8),
        1 => {
            let mut big = [0u8; 8];
            r.read_exact(&mut big).ok()?;
            (u64::from_be_bytes(big), 16)
        }
        n => (n, 8),
    };
    if size < header_len || pos.checked_add(size)? > limit {
        return None;
    }
    Some(BoxHeader {
        kind,
        start: pos,
        header_len,
        size,
    })
}

fn mvhd_duration_secs<R: Read + Seek>(r: &mut R, len: u64) -> Option<f64> {
    let mut pos = 0u64;
    for _ in 0..MAX_BOXES {
        let b = read_box_header(r, pos, len)?;
        if &b.kind == b"moov" {
            return mvhd_in_moov(r, b.start + b.header_len, b.start + b.size);
        }
        pos = b.start + b.size;
        if pos >= len {
            return None;
        }
    }
    None
}

fn mvhd_in_moov<R: Read + Seek>(r: &mut R, mut pos: u64, end: u64) -> Option<f64> {
    for _ in 0..MAX_BOXES {
        let b = read_box_header(r, pos, end)?;
        if &b.kind == b"mvhd" {
            return parse_mvhd(r, b.start + b.header_len, b.size - b.header_len);
        }
        pos = b.start + b.size;
        if pos >= end {
            return None;
        }
    }
    None
}

/// mvhd: версия 0 — `creation(4) modification(4) timescale(4) duration(4)`,
/// версия 1 — `creation(8) modification(8) timescale(4) duration(8)`.
fn parse_mvhd<R: Read + Seek>(r: &mut R, at: u64, payload_len: u64) -> Option<f64> {
    r.seek(SeekFrom::Start(at)).ok()?;
    let mut version = [0u8; 1];
    r.read_exact(&mut version).ok()?;
    let (timescale, duration) = match version[0] {
        0 => {
            if payload_len < 20 {
                return None;
            }
            r.seek(SeekFrom::Current(3 + 8)).ok()?; // flags, creation, modification
            let mut buf = [0u8; 8];
            r.read_exact(&mut buf).ok()?;
            (
                u32::from_be_bytes([buf[0], buf[1], buf[2], buf[3]]),
                u32::from_be_bytes([buf[4], buf[5], buf[6], buf[7]]) as u64,
            )
        }
        1 => {
            if payload_len < 32 {
                return None;
            }
            r.seek(SeekFrom::Current(3 + 16)).ok()?; // flags, creation, modification
            let mut buf = [0u8; 12];
            r.read_exact(&mut buf).ok()?;
            (
                u32::from_be_bytes([buf[0], buf[1], buf[2], buf[3]]),
                u64::from_be_bytes([
                    buf[4], buf[5], buf[6], buf[7], buf[8], buf[9], buf[10], buf[11],
                ]),
            )
        }
        _ => return None,
    };
    if timescale == 0 || duration == 0 {
        return None;
    }
    Some(duration as f64 / timescale as f64)
}

fn allowed_roots() -> Vec<PathBuf> {
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

fn random_token() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0x9e37_79b9_7f4a_7c15);
    let mut x = nanos
        ^ ((std::process::id() as u64) << 32)
        ^ (&nanos as *const u64 as u64)
        ^ 0x2545_f491_4f6c_dd1d;
    let mut out = String::with_capacity(32);
    for _ in 0..4 {
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        out.push_str(&format!("{:08x}", x as u32));
    }
    out
}

struct Request {
    method: String,
    target: String,
    range: Option<String>,
}

fn serve(mut stream: TcpStream, shared: &Shared) -> io::Result<()> {
    stream.set_read_timeout(Some(Duration::from_secs(20)))?;
    stream.set_write_timeout(Some(Duration::from_secs(20)))?;

    let request = {
        let mut reader = BufReader::new(&stream);
        match read_request(&mut reader) {
            Some(r) => r,
            None => {
                let _ = write_error(&mut stream, 400, "Bad Request");
                return Ok(());
            }
        }
    };

    let result = dispatch(&mut stream, shared, &request);
    if let Err(err) = result {
        // The element may have cancelled mid-response; that is normal.
        if err.kind() != io::ErrorKind::BrokenPipe && err.kind() != io::ErrorKind::ConnectionReset {
            eprintln!("[Mark Player] range server: {err}");
        }
    }
    let _ = stream.flush();
    let _ = stream.shutdown(Shutdown::Both);
    Ok(())
}

fn read_request(reader: &mut BufReader<&TcpStream>) -> Option<Request> {
    let mut consumed = 0usize;
    let mut line = String::new();
    reader.read_line(&mut line).ok()?;
    consumed += line.len();
    let mut parts = line.trim_end().split_whitespace();
    let method = parts.next()?.to_string();
    let target = parts.next()?.to_string();
    let _version = parts.next()?;

    let mut range = None;
    loop {
        line.clear();
        let n = reader.read_line(&mut line).ok()?;
        if n == 0 {
            break;
        }
        consumed += n;
        if consumed > MAX_HEADER_BYTES {
            return None;
        }
        let trimmed = line.trim_end_matches(['\r', '\n']);
        if trimmed.is_empty() {
            break;
        }
        if let Some((key, value)) = trimmed.split_once(':') {
            if key.eq_ignore_ascii_case("range") {
                range = Some(value.trim().to_string());
            }
        }
    }
    Some(Request {
        method,
        target,
        range,
    })
}

fn dispatch(stream: &mut TcpStream, shared: &Shared, request: &Request) -> io::Result<()> {
    if request.method != "GET" && request.method != "HEAD" {
        return write_error(stream, 405, "Method Not Allowed");
    }

    let Some((route, query)) = request.target.split_once('?') else {
        return write_error(stream, 404, "Not Found");
    };
    if route != "/media" {
        return write_error(stream, 404, "Not Found");
    }

    let mut token = None;
    let mut raw_path = None;
    for pair in query.split('&') {
        let Some((key, value)) = pair.split_once('=') else {
            continue;
        };
        match key {
            "t" => token = Some(value.to_string()),
            "p" => raw_path = Some(value.to_string()),
            _ => {}
        }
    }

    if token.as_deref() != Some(shared.token.as_str()) {
        return write_error(stream, 403, "Forbidden");
    }
    let Some(raw_path) = raw_path else {
        return write_error(stream, 400, "Bad Request");
    };
    let Some(decoded) = percent_decode(&raw_path) else {
        return write_error(stream, 400, "Bad Request");
    };

    let path = PathBuf::from(decoded);
    let Ok(real) = path.canonicalize() else {
        return write_error(stream, 404, "Not Found");
    };
    if !shared
        .roots
        .iter()
        .any(|root| real.starts_with(root.as_path()))
    {
        return write_error(stream, 403, "Forbidden");
    }
    let Ok(mut file) = std::fs::File::open(&real) else {
        return write_error(stream, 404, "Not Found");
    };
    let len = match file.metadata() {
        Ok(m) if m.is_file() => m.len(),
        _ => return write_error(stream, 404, "Not Found"),
    };

    let content_type = content_type(&real);
    let is_head = request.method == "HEAD";

    let range = match request.range.as_deref().map(|r| parse_range(r, len)) {
        Some(RangeResult::Unsatisfiable) => {
            let headers = format!(
                "HTTP/1.1 416 Range Not Satisfiable\r\nContent-Range: bytes */{len}\r\nContent-Length: 0\r\nAccept-Ranges: bytes\r\nConnection: close\r\n\r\n"
            );
            stream.write_all(headers.as_bytes())?;
            return Ok(());
        }
        Some(RangeResult::Valid(start, end)) => Some((start, end)),
        _ => None,
    };

    let (status, start, end) = match range {
        Some((start, end)) => ("206 Partial Content", start, end),
        None if len == 0 => ("200 OK", 0, 0),
        None => ("200 OK", 0, len - 1),
    };

    let mut headers = format!(
        "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nAccept-Ranges: bytes\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Headers: Range\r\nAccess-Control-Expose-Headers: Content-Range, Accept-Ranges, Content-Length\r\nCache-Control: no-store\r\nConnection: close\r\n"
    );
    if status == "206 Partial Content" {
        headers.push_str(&format!("Content-Range: bytes {start}-{end}/{len}\r\n"));
    }
    let body_len = if len == 0 { 0 } else { end - start + 1 };
    headers.push_str(&format!("Content-Length: {body_len}\r\n\r\n"));
    stream.write_all(headers.as_bytes())?;

    if is_head || body_len == 0 {
        return Ok(());
    }

    file.seek(SeekFrom::Start(start))?;
    let mut remaining = body_len;
    let mut buffer = vec![0u8; CHUNK];
    while remaining > 0 {
        let want = remaining.min(CHUNK as u64) as usize;
        let read = file.read(&mut buffer[..want])?;
        if read == 0 {
            break;
        }
        stream.write_all(&buffer[..read])?;
        remaining -= read as u64;
    }
    Ok(())
}

fn write_error(stream: &mut TcpStream, code: u16, reason: &str) -> io::Result<()> {
    let body = format!("{code} {reason}");
    let headers = format!(
        "HTTP/1.1 {code} {reason}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n",
        body.len()
    );
    stream.write_all(headers.as_bytes())?;
    stream.write_all(body.as_bytes())
}

#[derive(Debug, PartialEq)]
enum RangeResult {
    Valid(u64, u64),
    Unsatisfiable,
    Ignore,
}

fn parse_range(header: &str, len: u64) -> RangeResult {
    let Some(spec) = header.trim().strip_prefix("bytes=") else {
        return RangeResult::Ignore;
    };
    // Multi-range is legal but media players ask for one; serve the first.
    let first = spec.split(',').next().unwrap_or("").trim();
    let Some((start_raw, end_raw)) = first.split_once('-') else {
        return RangeResult::Ignore;
    };
    let start_raw = start_raw.trim();
    let end_raw = end_raw.trim();

    if start_raw.is_empty() {
        let Ok(suffix) = end_raw.parse::<u64>() else {
            return RangeResult::Ignore;
        };
        if suffix == 0 || len == 0 {
            return RangeResult::Unsatisfiable;
        }
        let start = len.saturating_sub(suffix);
        return RangeResult::Valid(start, len - 1);
    }

    let Ok(start) = start_raw.parse::<u64>() else {
        return RangeResult::Ignore;
    };
    if start >= len {
        return RangeResult::Unsatisfiable;
    }
    if end_raw.is_empty() {
        return RangeResult::Valid(start, len - 1);
    }
    let Ok(end) = end_raw.parse::<u64>() else {
        return RangeResult::Ignore;
    };
    if end < start {
        return RangeResult::Unsatisfiable;
    }
    RangeResult::Valid(start, end.min(len - 1))
}

fn content_type(path: &Path) -> &'static str {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();
    match ext.as_str() {
        "mov" | "qt" => "video/quicktime",
        "mp4" | "m4v" => "video/mp4",
        "m4a" => "audio/mp4",
        "wav" => "audio/wav",
        "mp3" => "audio/mpeg",
        "aif" | "aiff" => "audio/aiff",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        _ => "application/octet-stream",
    }
}

fn percent_encode(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for byte in value.as_bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' | b'/' => {
                out.push(*byte as char)
            }
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

fn percent_decode(value: &str) -> Option<String> {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'%' => {
                let hi = hex_value(*bytes.get(i + 1)?)?;
                let lo = hex_value(*bytes.get(i + 2)?)?;
                out.push(hi * 16 + lo);
                i += 3;
            }
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b => {
                out.push(b);
                i += 1;
            }
        }
    }
    String::from_utf8(out).ok()
}

fn hex_value(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const BIG: u64 = 6_776_854_168;

    #[test]
    fn parses_open_ended_range() {
        assert_eq!(parse_range("bytes=1024-", BIG), RangeResult::Valid(1024, BIG - 1));
    }

    #[test]
    fn clamps_range_end_past_eof() {
        assert_eq!(
            parse_range("bytes=100-999999999999", BIG),
            RangeResult::Valid(100, BIG - 1)
        );
    }

    #[test]
    fn parses_suffix_range() {
        assert_eq!(parse_range("bytes=-1000", BIG), RangeResult::Valid(BIG - 1000, BIG - 1));
    }

    #[test]
    fn rejects_start_past_eof() {
        assert_eq!(parse_range("bytes=6776854168-", BIG), RangeResult::Unsatisfiable);
    }

    #[test]
    fn ignores_foreign_units() {
        assert_eq!(parse_range("items=0-10", BIG), RangeResult::Ignore);
        assert_eq!(parse_range("bytes=abc-def", BIG), RangeResult::Ignore);
    }

    #[test]
    fn range_over_four_gib_is_64_bit() {
        assert_eq!(
            parse_range("bytes=6000000000-6000000100", BIG),
            RangeResult::Valid(6_000_000_000, 6_000_000_100)
        );
    }

    #[test]
    fn percent_roundtrip_keeps_unicode_and_spaces() {
        let raw = "/Volumes/temp work/261002_mone/Прокси/P1755050.MOV";
        assert_eq!(percent_decode(&percent_encode(raw)).as_deref(), Some(raw));
    }

    #[test]
    fn percent_decode_rejects_truncated_escape() {
        assert!(percent_decode("abc%4").is_none());
        assert!(percent_decode("abc%zz").is_none());
    }

    #[test]
    fn content_type_covers_material_formats() {
        assert_eq!(content_type(Path::new("a.MOV")), "video/quicktime");
        assert_eq!(content_type(Path::new("a.wav")), "audio/wav");
        assert_eq!(content_type(Path::new("a.unknown")), "application/octet-stream");
    }

    #[test]
    fn small_files_stay_on_the_asset_transport() {
        let path = std::env::temp_dir().join(format!("mark-range-small-{}", std::process::id()));
        std::fs::write(&path, b"not really a movie").expect("write sample");
        let server = RangeServer::start().expect("start server");
        assert_eq!(server.url_for(&path).expect("url_for"), None);
        let _ = std::fs::remove_file(&path);
    }

    // ---- 0.26.11: правило по битрейту -------------------------------------
    // Синтетические MOV: ftyp + mdat (разреженные нули) + moov с mvhd, как у
    // камеры (moov в конце). Содержимое кадров разбору не нужно — только боксы.

    fn be32(v: u32) -> [u8; 4] {
        v.to_be_bytes()
    }

    fn boxed(kind: &[u8; 4], payload: &[u8]) -> Vec<u8> {
        let mut out = Vec::with_capacity(8 + payload.len());
        out.extend_from_slice(&be32((8 + payload.len()) as u32));
        out.extend_from_slice(kind);
        out.extend_from_slice(payload);
        out
    }

    fn ftyp() -> Vec<u8> {
        boxed(b"ftyp", b"qt  \0\0\0\0qt  ")
    }

    fn mvhd_v0(timescale: u32, duration: u32) -> Vec<u8> {
        let mut p = vec![0u8; 4]; // version 0 + flags
        p.extend_from_slice(&[0u8; 8]); // creation, modification
        p.extend_from_slice(&be32(timescale));
        p.extend_from_slice(&be32(duration));
        p.extend_from_slice(&[0u8; 80]); // rate … next_track_id: разбору не нужны
        boxed(b"mvhd", &p)
    }

    fn mvhd_v1(timescale: u32, duration: u64) -> Vec<u8> {
        let mut p = vec![1u8, 0, 0, 0]; // version 1 + flags
        p.extend_from_slice(&[0u8; 16]); // creation, modification (64 бит)
        p.extend_from_slice(&be32(timescale));
        p.extend_from_slice(&duration.to_be_bytes());
        p.extend_from_slice(&[0u8; 80]);
        boxed(b"mvhd", &p)
    }

    fn tmp_path(tag: &str) -> PathBuf {
        std::env::temp_dir().join(format!("mark-range-{tag}-{}", std::process::id()))
    }

    /// ftyp + mdat (`mdat_payload` разреженных нулей) + moov в конце.
    /// `wide_mdat` — размер бокса через size==1 + 64-битный largesize.
    fn write_movie(path: &Path, mdat_payload: u64, wide_mdat: bool, moov_children: &[u8]) {
        let mut f = std::fs::File::create(path).expect("create sample");
        f.write_all(&ftyp()).expect("ftyp");
        if wide_mdat {
            f.write_all(&be32(1)).expect("mdat size marker");
            f.write_all(b"mdat").expect("mdat kind");
            f.write_all(&(16 + mdat_payload).to_be_bytes()).expect("mdat largesize");
        } else {
            f.write_all(&be32((8 + mdat_payload) as u32)).expect("mdat size");
            f.write_all(b"mdat").expect("mdat kind");
        }
        let here = f.stream_position().expect("position");
        f.set_len(here + mdat_payload).expect("sparse mdat");
        f.seek(SeekFrom::End(0)).expect("seek end");
        f.write_all(&boxed(b"moov", moov_children)).expect("moov");
    }

    fn duration_of(tag: &str, build: impl FnOnce(&Path)) -> Option<f64> {
        let path = tmp_path(tag);
        build(&path);
        let got = movie_duration_secs(&path);
        let _ = std::fs::remove_file(&path);
        got
    }

    #[test]
    fn mvhd_v0_with_moov_at_the_end_gives_the_duration() {
        let got = duration_of("mvhd-v0", |p| write_movie(p, 1024, false, &mvhd_v0(1000, 25_920)));
        assert!((got.expect("duration") - 25.92).abs() < 1e-9, "got {got:?}");
    }

    #[test]
    fn mvhd_v1_gives_the_duration() {
        let got = duration_of("mvhd-v1", |p| write_movie(p, 1024, false, &mvhd_v1(600, 6_000)));
        assert!((got.expect("duration") - 10.0).abs() < 1e-9, "got {got:?}");
    }

    #[test]
    fn moov_before_mdat_is_found() {
        let got = duration_of("moov-first", |p| {
            let mut bytes = ftyp();
            bytes.extend(boxed(b"moov", &mvhd_v0(1000, 4_000)));
            bytes.extend(boxed(b"mdat", &[0u8; 64]));
            std::fs::write(p, bytes).expect("write sample");
        });
        assert!((got.expect("duration") - 4.0).abs() < 1e-9, "got {got:?}");
    }

    #[test]
    fn mvhd_is_found_when_it_is_not_the_first_child_of_moov() {
        let mut children = boxed(b"free", &[0u8; 16]);
        children.extend(mvhd_v0(1000, 2_500));
        let got = duration_of("mvhd-later", |p| write_movie(p, 256, false, &children));
        assert!((got.expect("duration") - 2.5).abs() < 1e-9, "got {got:?}");
    }

    #[test]
    fn mdat_with_a_64_bit_largesize_is_walked() {
        let got = duration_of("wide-mdat", |p| write_movie(p, 4096, true, &mvhd_v0(1000, 3_000)));
        assert!((got.expect("duration") - 3.0).abs() < 1e-9, "got {got:?}");
    }

    #[test]
    fn moov_beyond_four_gib_is_reached() {
        // Разреженный файл: на диске почти ничего, но смещение moov > 4 ГиБ.
        let got = duration_of("past-4gib", |p| {
            write_movie(p, 5_300_000_000, true, &mvhd_v0(600, 6_000))
        });
        assert!((got.expect("duration") - 10.0).abs() < 1e-9, "got {got:?}");
    }

    #[test]
    fn a_file_that_is_not_a_movie_gives_none() {
        let got = duration_of("not-a-movie", |p| {
            std::fs::write(p, vec![b'h'; 4096]).expect("write sample");
        });
        assert_eq!(got, None);
    }

    #[test]
    fn a_truncated_movie_gives_none() {
        // mdat заявляет миллион байт, а файл кончается сразу после заголовка.
        let cut_mdat = duration_of("cut-mdat", |p| {
            let mut bytes = ftyp();
            bytes.extend_from_slice(&be32(1_000_000));
            bytes.extend_from_slice(b"mdat");
            std::fs::write(p, bytes).expect("write sample");
        });
        assert_eq!(cut_mdat, None);
        // moov обрезан на середине mvhd.
        let cut_moov = duration_of("cut-moov", |p| {
            write_movie(p, 128, false, &mvhd_v0(1000, 1_000));
            let f = std::fs::OpenOptions::new().write(true).open(p).expect("open");
            let len = f.metadata().expect("meta").len();
            f.set_len(len - 40).expect("truncate");
        });
        assert_eq!(cut_moov, None);
    }

    #[test]
    fn zero_duration_or_zero_timescale_gives_none() {
        let zero_duration = duration_of("zero-dur", |p| write_movie(p, 64, false, &mvhd_v0(1000, 0)));
        assert_eq!(zero_duration, None);
        let zero_scale = duration_of("zero-scale", |p| write_movie(p, 64, false, &mvhd_v0(0, 5_000)));
        assert_eq!(zero_scale, None);
    }

    #[test]
    fn rate_rule_routes_4k_50p_but_not_fullhd_or_proxy() {
        // P1755009: 4К 50p, ≈143 Мбит/с — 468 970 021 Б за 25,92 с.
        assert!(loopback_wanted(468_970_021, Some(25.92)));
        // P1755097: FullHD 50p, ≈51 Мбит/с — 1,035 ГБ за 156 с (≈6,6 МБ/с).
        assert!(!loopback_wanted(1_035_000_000, Some(156.0)));
        // Прокси ≈14 Мбит/с — 1 351 337 073 Б за 682,56 с.
        assert!(!loopback_wanted(1_351_337_073, Some(682.56)));
    }

    #[test]
    fn rate_threshold_is_inclusive() {
        let len = LOOPBACK_MIN_BYTES_PER_SEC * 10;
        assert!(loopback_wanted(len, Some(10.0)));
        assert!(!loopback_wanted(len - 1, Some(10.0)));
    }

    #[test]
    fn size_rule_is_unchanged() {
        assert!(loopback_wanted(LOOPBACK_MIN_BYTES, None));
        assert!(loopback_wanted(LOOPBACK_MIN_BYTES, Some(100_000.0)));
        assert!(!loopback_wanted(LOOPBACK_MIN_BYTES - 1, None));
    }

    #[test]
    fn small_files_and_unknown_duration_stay_on_the_asset_transport() {
        // Меньше пола — правило по битрейту не смотрим.
        assert!(!loopback_wanted(LOOPBACK_RATE_MIN_FILE_BYTES - 1, Some(0.1)));
        // Длительность неизвестна или нулевая — только правило по размеру.
        assert!(!loopback_wanted(1_000_000_000, None));
        assert!(!loopback_wanted(1_000_000_000, Some(0.0)));
    }

    #[test]
    fn url_for_sends_a_4k_like_movie_to_loopback() {
        // ≈470 МБ за 26 с ≈ 18 МБ/с — как 4К 50p GH5.
        let path = tmp_path("url-4k");
        write_movie(&path, 470_000_000, false, &mvhd_v0(1000, 26_000));
        let server = RangeServer::start().expect("start server");
        let got = server.url_for(&path).expect("url_for");
        let _ = std::fs::remove_file(&path);
        let url = got.expect("a 4K-class bitrate must use loopback");
        assert!(url.starts_with(&format!("http://127.0.0.1:{}/media?t=", server.port)));
    }

    #[test]
    fn url_for_keeps_a_fullhd_like_movie_on_the_asset_transport() {
        // ≈1 ГБ за 156 с ≈ 6,4 МБ/с — FullHD 50p той же камеры.
        let path = tmp_path("url-fhd");
        write_movie(&path, 1_000_000_000, false, &mvhd_v0(1000, 156_000));
        let server = RangeServer::start().expect("start server");
        let got = server.url_for(&path).expect("url_for");
        let _ = std::fs::remove_file(&path);
        assert_eq!(got, None);
    }

    // Ручная улика на реальном материале заказа (только чтение, 100 байт).
    // cargo test --release -- --ignored serves_range_beyond_four_gib
    #[test]
    #[ignore = "needs the 6.78 GB proxy on /Volumes; manual evidence run"]
    fn serves_range_beyond_four_gib() {
        let path = Path::new(
            "/Volumes/tempwork/261002_mone/source/sd1/Proxies/P1755050.MOV",
        );
        let server = RangeServer::start().expect("start server");
        let url = server
            .url_for(path)
            .expect("url_for")
            .expect("large file must use loopback");
        let target = url
            .strip_prefix(&format!("http://127.0.0.1:{}", server.port))
            .expect("url shape")
            .to_string();

        let mut stream = TcpStream::connect(("127.0.0.1", server.port)).expect("connect");
        let request = format!(
            "GET {target} HTTP/1.1\r\nHost: 127.0.0.1\r\nRange: bytes=6000000000-6000000099\r\nConnection: close\r\n\r\n"
        );
        stream.write_all(request.as_bytes()).expect("write request");
        let mut response = Vec::new();
        stream.read_to_end(&mut response).expect("read response");
        let text = String::from_utf8_lossy(&response);
        let head = text.split("\r\n\r\n").next().unwrap_or("");

        assert!(head.starts_with("HTTP/1.1 206"), "status: {head}");
        assert!(head.contains("Content-Range: bytes 6000000000-6000000099/6776854168"));
        assert!(head.contains("Content-Length: 100"));
        let body_start = response
            .windows(4)
            .position(|w| w == b"\r\n\r\n")
            .expect("header end")
            + 4;
        assert_eq!(response.len() - body_start, 100);

        // Токен обязателен: тот же путь без t= получает 403.
        let wrong = target.split("&p=").nth(1).expect("path part");
        let request = format!(
            "GET /media?t=nope&p={wrong} HTTP/1.1\r\nHost: 127.0.0.1\r\nRange: bytes=0-9\r\nConnection: close\r\n\r\n"
        );
        let mut stream = TcpStream::connect(("127.0.0.1", server.port)).expect("connect");
        stream.write_all(request.as_bytes()).expect("write request");
        let mut response = Vec::new();
        let _ = stream.read_to_end(&mut response);
        assert!(String::from_utf8_lossy(&response).starts_with("HTTP/1.1 403"));
    }
}
