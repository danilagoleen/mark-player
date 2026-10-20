#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod range_server;

use serde::Serialize;
use tauri::{Emitter, LogicalSize, Manager, PhysicalSize, Size, WebviewWindow};

#[derive(Debug, Clone, Serialize)]
struct PlayerWindowTrace {
    scale_factor: f64,
    inner_physical_width: u32,
    inner_physical_height: u32,
    outer_physical_width: u32,
    outer_physical_height: u32,
    inner_logical_width: f64,
    inner_logical_height: f64,
    outer_logical_width: f64,
    outer_logical_height: f64,
}

fn trace_window(window: &WebviewWindow) -> Result<PlayerWindowTrace, String> {
    let scale_factor = window
        .scale_factor()
        .map_err(|e| format!("scale_factor failed: {e}"))?
        .max(1.0);
    let inner = window
        .inner_size()
        .map_err(|e| format!("inner_size failed: {e}"))?;
    let outer = window
        .outer_size()
        .map_err(|e| format!("outer_size failed: {e}"))?;

    Ok(PlayerWindowTrace {
        scale_factor,
        inner_physical_width: inner.width,
        inner_physical_height: inner.height,
        outer_physical_width: outer.width,
        outer_physical_height: outer.height,
        inner_logical_width: inner.width as f64 / scale_factor,
        inner_logical_height: inner.height as f64 / scale_factor,
        outer_logical_width: outer.width as f64 / scale_factor,
        outer_logical_height: outer.height as f64 / scale_factor,
    })
}

fn candidate_score(width: i32, height: i32, requested_width: i32, requested_height: i32) -> i32 {
    (width - requested_width).abs() + (height - requested_height).abs()
}

fn candidate_from_height(height: i32, ratio: f64) -> (i32, i32) {
    let width = ((height as f64) * ratio).round().max(1.0) as i32;
    (width, height)
}

fn candidate_from_width(width: i32, ratio: f64) -> (i32, i32) {
    let height = ((width as f64) / ratio).round().max(1.0) as i32;
    (width, height)
}

fn snap_logical_size_for_aspect(
    window: &WebviewWindow,
    width: f64,
    height: f64,
    aspect_width: f64,
    aspect_height: f64,
) -> Result<(f64, f64), String> {
    if !(aspect_width.is_finite() && aspect_height.is_finite()) || aspect_width <= 0.0 || aspect_height <= 0.0 {
        return Ok((width.max(240.0).round(), height.max(220.0).round()));
    }

    let scale_factor = window
        .scale_factor()
        .map_err(|e| format!("scale_factor failed: {e}"))?
        .max(1.0);
    let ratio = aspect_width / aspect_height;
    let requested_width = ((width.max(240.0)) * scale_factor).round().max(1.0) as i32;
    let requested_height = ((height.max(220.0)) * scale_factor).round().max(1.0) as i32;

    let height_candidates = [
        requested_height - 1,
        requested_height,
        requested_height + 1,
    ]
    .into_iter()
    .filter(|value| *value > 0)
    .map(|value| candidate_from_height(value, ratio));

    let width_candidates = [
        requested_width - 1,
        requested_width,
        requested_width + 1,
    ]
    .into_iter()
    .filter(|value| *value > 0)
    .map(|value| candidate_from_width(value, ratio));

    let mut best = (requested_width, requested_height);
    let mut best_score = candidate_score(best.0, best.1, requested_width, requested_height);

    for candidate in height_candidates.chain(width_candidates) {
        let score = candidate_score(candidate.0, candidate.1, requested_width, requested_height);
        if score < best_score {
            best = candidate;
            best_score = score;
        }
    }

    Ok((
        (best.0 as f64 / scale_factor).max(240.0),
        (best.1 as f64 / scale_factor).max(220.0),
    ))
}

fn set_window_logical_size(window: &WebviewWindow, width: f64, height: f64) -> Result<(), String> {
    window
        .set_size(Size::Logical(LogicalSize::new(width, height)))
        .map_err(|e| format!("set_size failed: {e}"))
}

fn snap_trace_to_aspect(
    trace: &PlayerWindowTrace,
    aspect_width: f64,
    aspect_height: f64,
) -> Option<PhysicalSize<u32>> {
    if !(aspect_width.is_finite() && aspect_height.is_finite()) || aspect_width <= 0.0 || aspect_height <= 0.0 {
        return None;
    }
    let ratio = aspect_width / aspect_height;
    let current_width = trace.inner_physical_width as i32;
    let current_height = trace.inner_physical_height as i32;
    if current_width <= 0 || current_height <= 0 {
        return None;
    }

    let from_height = candidate_from_height(current_height, ratio);
    let from_width = candidate_from_width(current_width, ratio);
    let current_score = candidate_score(current_width, current_height, current_width, current_height);
    let height_score = candidate_score(from_height.0, from_height.1, current_width, current_height);
    let width_score = candidate_score(from_width.0, from_width.1, current_width, current_height);

    let best = if height_score <= width_score {
        from_height
    } else {
        from_width
    };

    if height_score.min(width_score) >= current_score {
        return None;
    }

    let best_width = best.0.max(1) as u32;
    let best_height = best.1.max(1) as u32;
    if best_width == trace.inner_physical_width && best_height == trace.inner_physical_height {
        return None;
    }

    Some(PhysicalSize::new(best_width, best_height))
}

#[cfg(target_os = "macos")]
fn set_content_aspect_ratio(
    window: &WebviewWindow,
    aspect_width: f64,
    aspect_height: f64,
) -> Result<(), String> {
    use objc2::runtime::AnyObject;
    use objc2_app_kit::NSWindow;
    use objc2_foundation::NSSize;

    if !(aspect_width.is_finite() && aspect_height.is_finite()) {
        return Ok(());
    }
    if aspect_width <= 0.0 || aspect_height <= 0.0 {
        return Ok(());
    }

    let ns_window = window
        .ns_window()
        .map_err(|e| format!("ns_window failed: {e}"))? as usize;

    let aspect_width = aspect_width.max(1.0);
    let aspect_height = aspect_height.max(1.0);

    window
        .run_on_main_thread(move || unsafe {
            let ns_window: &NSWindow = &*((ns_window as *mut AnyObject).cast::<NSWindow>());
            let aspect = NSSize::new(aspect_width, aspect_height);
            ns_window.setContentAspectRatio(aspect);
        })
        .map_err(|e| format!("run_on_main_thread failed: {e}"))
}

#[cfg(not(target_os = "macos"))]
fn set_content_aspect_ratio(
    _window: &WebviewWindow,
    _aspect_width: f64,
    _aspect_height: f64,
) -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "macos")]
fn toggle_fullscreen_native(window: &WebviewWindow) -> Result<bool, String> {
    use objc2::runtime::AnyObject;
    use objc2_app_kit::NSWindow;

    let current = window
        .is_fullscreen()
        .map_err(|e| format!("is_fullscreen failed: {e}"))?;
    let ns_window = window
        .ns_window()
        .map_err(|e| format!("ns_window failed: {e}"))? as usize;

    window
        .run_on_main_thread(move || unsafe {
            let ns_window: &NSWindow = &*((ns_window as *mut AnyObject).cast::<NSWindow>());
            ns_window.toggleFullScreen(None);
        })
        .map_err(|e| format!("run_on_main_thread failed: {e}"))?;

    Ok(!current)
}

#[cfg(not(target_os = "macos"))]
fn toggle_fullscreen_native(window: &WebviewWindow) -> Result<bool, String> {
    let current = window
        .is_fullscreen()
        .map_err(|e| format!("is_fullscreen failed: {e}"))?;
    let next = !current;
    window
        .set_fullscreen(next)
        .map_err(|e| format!("set_fullscreen failed: {e}"))?;
    Ok(next)
}

#[tauri::command]
fn configure_player_window(
    window: WebviewWindow,
    width: f64,
    height: f64,
    aspect_width: f64,
    aspect_height: f64,
) -> Result<bool, String> {
    let (width, height) =
        snap_logical_size_for_aspect(&window, width, height, aspect_width, aspect_height)?;
    set_window_logical_size(&window, width, height)?;

    set_content_aspect_ratio(&window, aspect_width, aspect_height)?;

    let trace = trace_window(&window)?;
    if let Some(snapped_physical) = snap_trace_to_aspect(&trace, aspect_width, aspect_height) {
        let corrected_width = snapped_physical.width as f64 / trace.scale_factor;
        let corrected_height = snapped_physical.height as f64 / trace.scale_factor;
        set_window_logical_size(&window, corrected_width, corrected_height)?;
    }
    Ok(true)
}

#[tauri::command]
fn toggle_player_fullscreen(window: WebviewWindow) -> Result<bool, String> {
    toggle_fullscreen_native(&window)
}

#[tauri::command]
fn trace_player_window(window: WebviewWindow) -> Result<PlayerWindowTrace, String> {
    trace_window(&window)
}

#[tauri::command]
fn open_panel_window(
    app: tauri::AppHandle,
    label: String,
    route: String,
    title: String,
    width: f64,
    height: f64,
    base_url: String,
    query: Option<String>,
) -> Result<(), String> {
    use tauri::Manager;
    let path = format!("{}.html", route);
    let url_str = if let Some(q) = &query {
        format!("{}/{}?{}", base_url.trim_end_matches('/'), path, q)
    } else {
        format!("{}/{}", base_url.trim_end_matches('/'), path)
    };
    // Repeat open must focus the existing window, not fail silently
    // [signal: повторный ⌘L фокусирует окно] [project: cut-player].
    // 0.21.1 (регресс: виден только первый коммент): фокуса мало — окно
    // залипало на первом ?marker=/?media=, новые комменты не показывались.
    // Если зовут со свежим query — везём существующее окно на новый URL.
    if let Some(win) = app.get_webview_window(&label) {
        if query.is_some() {
            let js_url = serde_json::to_string(&url_str)
                .map_err(|e| format!("Failed to encode panel URL: {}", e))?;
            let _ = win.eval(&format!("window.location.replace({})", js_url));
        }
        let _ = win.unminimize();
        let _ = win.show();
        win.set_focus()
            .map_err(|e| format!("Failed to focus window: {}", e))?;
        return Ok(());
    }
    let url = url::Url::parse(&url_str)
        .map_err(|e| format!("Invalid panel URL: {}", e))?;

    // tb_1792023845_97848_2: панели — дочерние к main (parent): всегда выше
    // плеера (macOS addChildWindow / Windows owned / Linux transient-for),
    // но НЕ системный always-on-top. Родитель цепляется только при создании;
    // повторное открытие существующего окна — фокус, как раньше.
    let main = app.get_webview_window("main");
    let fresh_builder = || {
        tauri::WebviewWindowBuilder::new(&app, &label, tauri::WebviewUrl::External(url.clone()))
            .title(title.clone())
            .inner_size(width, height)
            .focused(true)
    };
    let builder = match &main {
        Some(m) => match fresh_builder().parent(m) {
            Ok(b) => b,
            Err(e) => {
                // Только Windows (нет hwnd): панель без родителя, как раньше.
                eprintln!("[Mark Player] panel '{}' without parent: {}", label, e);
                fresh_builder()
            }
        },
        None => fresh_builder(),
    };
    let win = builder
        .build()
        .map_err(|e| format!("Failed to create window: {}", e))?;
    // Косметика 2026-09-25: панели справа от главного окна, а не поверх видео.
    // Кламп в монитор: если справа нет места — втискиваем в видимую область.
    if let Some(main) = &main {
        if let (Ok(pos), Ok(size), Ok(scale)) =
            (main.outer_position(), main.outer_size(), main.scale_factor())
        {
            let gap = 12.0;
            let pw = width * scale;
            let ph = height * scale;
            let mut x = pos.x as f64 + size.width as f64 + gap;
            let mut y = pos.y as f64;
            if let Ok(Some(mon)) = main.current_monitor() {
                let mp = mon.position();
                let ms = mon.size();
                let max_x = mp.x as f64 + ms.width as f64 - pw;
                let max_y = mp.y as f64 + ms.height as f64 - ph;
                if x > max_x {
                    x = max_x.max(mp.x as f64);
                }
                y = y.clamp(mp.y as f64, max_y.max(mp.y as f64));
            }
            let _ = win.set_position(tauri::Position::Logical(tauri::LogicalPosition::new(
                x / scale,
                y / scale,
            )));
        }
    }
    Ok(())
}

#[tauri::command]
fn emit_menu_event(window: WebviewWindow, action: String) -> Result<(), String> {
    window.emit("menu-event", action)
        .map_err(|e| format!("emit failed: {e}"))
}

// tb_1791583578_64923_1: имя пользователя ОС — дефолт подписи комментариев
// (пассивно: при первом комменте один раз предлагают поправить).
// Без новых крейтов: USER (macOS/Linux) → USERNAME (Windows) → честная ошибка.
#[tauri::command]
fn os_username() -> Result<String, String> {
    for key in ["USER", "LOGNAME", "USERNAME"] {
        if let Ok(v) = std::env::var(key) {
            let clean = v.trim().to_string();
            if (!clean.is_empty()) && clean.len() <= 64 {
                return Ok(clean);
            }
        }
    }
    Err("no username in environment".to_string())
}

// 0.22: сэмпл байтов для content-hash identity маркеров (копия видео
// не теряет разметку). Размер + голова/хвост 64KB: два seek, файл целиком
// в память не грузится. Возвращает массивы байтов — base64-зависимостей
// ради 128KB тащить не стали, IPC локальный.
#[derive(serde::Serialize)]
struct FileContentSample {
    size: u64,
    head: Vec<u8>,
    tail: Vec<u8>,
}

// tb_1792438559_20717_1: почему 6.7 ГБ proxy молчит. Tauri asset protocol
// отдаёт файл в WKWebView через custom scheme, а на macOS он ломается на
// файлах больше ~3.5-4 ГиБ (tauri#6375, tauri#7355). Для moov-at-end это
// ещё и дальний сик: 2015с из 3426с — это ~4 ГБ от начала. Читаем только
// заголовки top-level атомов (пара seek), чтобы плеер мог громко назвать
// причину вместо чёрного экрана.
#[derive(Debug, Clone, Serialize)]
struct MediaContainerInfo {
    size: u64,
    moov_offset: Option<u64>,
    mdat_offset: Option<u64>,
    moov_at_end: bool,
}

fn inspect_atom_header(
    file: &mut std::fs::File,
    offset: u64,
    file_size: u64,
) -> Result<Option<(String, u64)>, String> {
    use std::io::{Read, Seek, SeekFrom};
    if offset.saturating_add(8) > file_size {
        return Ok(None);
    }
    file.seek(SeekFrom::Start(offset))
        .map_err(|e| format!("seek failed: {e}"))?;
    let mut head = [0u8; 8];
    file.read_exact(&mut head)
        .map_err(|e| format!("read atom header failed: {e}"))?;
    let size32 = u32::from_be_bytes([head[0], head[1], head[2], head[3]]) as u64;
    let kind = String::from_utf8_lossy(&head[4..8]).to_string();
    let (size, header_len) = match size32 {
        0 => (file_size.saturating_sub(offset), 8u64),
        1 => {
            let mut ext = [0u8; 8];
            file.read_exact(&mut ext)
                .map_err(|e| format!("read largesize failed: {e}"))?;
            (u64::from_be_bytes(ext), 16u64)
        }
        n => (n, 8u64),
    };
    if size < header_len
        || offset
            .checked_add(size)
            .map_or(true, |end| end > file_size)
    {
        return Ok(None);
    }
    Ok(Some((kind, size)))
}

fn inspect_media_container_at(path: &std::path::Path) -> Result<MediaContainerInfo, String> {
    let mut file = std::fs::File::open(path).map_err(|e| format!("open failed: {e}"))?;
    let size = file
        .metadata()
        .map_err(|e| format!("stat failed: {e}"))?
        .len();
    let mut offset = 0u64;
    let mut moov_offset = None;
    let mut mdat_offset = None;
    // 64 top-level атомов хватает любому нормальному контейнеру; счётчик
    // защищает от битого size, который не двигает offset.
    for _ in 0..64 {
        let Some((kind, atom_size)) = inspect_atom_header(&mut file, offset, size)? else {
            break;
        };
        match kind.as_str() {
            "moov" => {
                moov_offset = Some(offset);
                break;
            }
            "mdat" => mdat_offset = Some(offset),
            _ => {}
        }
        offset = offset.saturating_add(atom_size);
        if offset >= size {
            break;
        }
    }
    Ok(MediaContainerInfo {
        size,
        moov_offset,
        mdat_offset,
        moov_at_end: matches!((mdat_offset, moov_offset), (Some(m), Some(v)) if m < v),
    })
}

#[tauri::command]
fn inspect_media_container(path: String) -> Result<MediaContainerInfo, String> {
    inspect_media_container_at(std::path::Path::new(&path))
}

#[tauri::command]
fn sample_file_bytes(path: String, sample_len: Option<u64>) -> Result<FileContentSample, String> {
    use std::io::{Read, Seek, SeekFrom};
    let want = sample_len.unwrap_or(65536).clamp(1, 1 << 20) as usize;
    let mut file = std::fs::File::open(&path).map_err(|e| format!("open failed: {e}"))?;
    let size = file
        .metadata()
        .map_err(|e| format!("stat failed: {e}"))?
        .len();
    let n = want.min(size as usize);
    if n == 0 {
        return Ok(FileContentSample {
            size,
            head: Vec::new(),
            tail: Vec::new(),
        });
    }
    let mut head = vec![0u8; n];
    file.read_exact(&mut head)
        .map_err(|e| format!("read head failed: {e}"))?;
    let mut tail = vec![0u8; n];
    file.seek(SeekFrom::End(-(n as i64)))
        .map_err(|e| format!("seek failed: {e}"))?;
    file.read_exact(&mut tail)
        .map_err(|e| format!("read tail failed: {e}"))?;
    Ok(FileContentSample {
        size,
        head,
        tail,
    })
}

// 0.26: переключатель транспорта. На macOS WKWebView по asset:// перестаёт
// читать mdat у файлов ≳5.2e9 Б (чёрный кадр без onError, см. range_server.rs).
// Таким файлам отдаём адрес loopback-сервера; остальным — None, и фронт
// остаётся на asset://.
#[tauri::command]
fn loopback_media_url(
    path: String,
    server: tauri::State<'_, range_server::RangeServer>,
) -> Result<Option<String>, String> {
    server.url_for(std::path::Path::new(&path))
}

fn main() {
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .setup(|app| {
            match range_server::RangeServer::start() {
                Ok(server) => {
                    app.manage(server);
                }
                Err(err) => {
                    // Медиа останется на asset:// — большой файл промолчит,
                    // но приложение не падает.
                    eprintln!("[Mark Player] media range server unavailable: {err}");
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            configure_player_window,
            toggle_player_fullscreen,
            trace_player_window,
            open_panel_window,
            emit_menu_event,
            inspect_media_container,
            sample_file_bytes,
            loopback_media_url,
            os_username,
        ]);

    // Bell №7 + UPD 9: pilot только по явному запросу И только в деве
    // (`npm run tauri:dev` включает фичу; релизный `tauri build` — нет).
    // tb_1791233252_7043_4: eval pilot возвращается через __callback IPC —
    // ему нужен pilot:default в capabilities. tauri.conf.json держит
    // capabilities=["default"] (релиз чист), а dev докладывает инлайн
    // dev-pilot через --config-оверлей в `npm run tauri:dev`.
    // Наивный revert pilot:default в default.json невозможен: tauri-build
    // роняет сборку на неизвестном пермишене, а в релизе pilot не скомпилирован.
    #[cfg(all(debug_assertions, feature = "pilot"))]
    {
        builder = builder.plugin(tauri_plugin_pilot::init());
    }
    builder = builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        // tb_1790710861_12931_16: автообновление (Check for Updates + тихая
        // проверка на старте). Диалог плагина выключен (dialog:false в
        // конфиге) — все строки ведёт фронт через тосты.
        .plugin(tauri_plugin_updater::Builder::new().build())
        // relaunch после install+relaunch (ядро api/process убрано в api 2.12).
        .plugin(tauri_plugin_process::init())
        // About: внешние ссылки (GitHub/Releases/mailto) через openUrl.
        .plugin(tauri_plugin_opener::init());

    builder
        .run(tauri::generate_context!())
        .expect("error while running Mark Player");
}

#[cfg(test)]
mod container_tests {
    use super::inspect_media_container_at;

    fn atom(kind: &[u8; 4], body: &[u8]) -> Vec<u8> {
        let mut out = Vec::with_capacity(8 + body.len());
        out.extend_from_slice(&((8 + body.len()) as u32).to_be_bytes());
        out.extend_from_slice(kind);
        out.extend_from_slice(body);
        out
    }

    fn write_sample(name: &str, atoms: Vec<Vec<u8>>) -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!("mark-container-{}-{name}", std::process::id()));
        let mut bytes = Vec::new();
        for a in atoms {
            bytes.extend_from_slice(&a);
        }
        std::fs::write(&path, bytes).expect("write sample");
        path
    }

    #[test]
    fn detects_moov_at_end() {
        let path = write_sample("moov-end", vec![atom(b"ftyp", &[0; 12]), atom(b"mdat", &[0; 100]), atom(b"moov", &[0; 40])]);
        let info = inspect_media_container_at(&path).expect("inspect");
        assert_eq!(info.moov_offset, Some(128));
        assert_eq!(info.mdat_offset, Some(20));
        assert!(info.moov_at_end);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn detects_faststart() {
        let path = write_sample("faststart", vec![atom(b"ftyp", &[0; 12]), atom(b"moov", &[0; 40]), atom(b"mdat", &[0; 100])]);
        let info = inspect_media_container_at(&path).expect("inspect");
        assert_eq!(info.moov_offset, Some(20));
        assert!(!info.moov_at_end);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn handles_64bit_largesize() {
        let mut mdat = Vec::new();
        mdat.extend_from_slice(&1u32.to_be_bytes());
        mdat.extend_from_slice(b"mdat");
        mdat.extend_from_slice(&(16u64 + 100).to_be_bytes());
        mdat.extend_from_slice(&[0u8; 100]);
        let path = write_sample("largesize", vec![atom(b"ftyp", &[0; 12]), mdat, atom(b"moov", &[0; 40])]);
        let info = inspect_media_container_at(&path).expect("inspect");
        assert_eq!(info.mdat_offset, Some(20));
        assert_eq!(info.moov_offset, Some(136));
        assert!(info.moov_at_end);
        let _ = std::fs::remove_file(&path);
    }
}
