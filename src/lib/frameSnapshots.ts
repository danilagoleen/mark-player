// 0.23 — кадры в точках маркеров (таск Белла): Review Notes с картинками.
//
// Захват идёт из живого <video> через canvas (seek → drawImage → JPEG),
// здесь — только чистая часть: имена файлов, размеры, data-URL, .txt-ссылки
// и самодостаточный .html. Никакого DOM/FS внутри — всё тестируется без
// браузера. Ядро остаётся без FFmpeg и новых зависимостей.

export const SNAPSHOT_MAX_WIDTH = 960;
export const SNAPSHOT_JPEG_QUALITY = 0.8;
export const SNAPSHOT_SEEK_TIMEOUT_MS = 10000;

export interface CapturedFrame {
  marker_id: string;
  anchor_sec: number;
  timecode: string;
  fileName: string;
  jpeg: Uint8Array;
  width: number;
  height: number;
}

// Имя JPEG по таймкоду: "00:01:49:18" → "00-01-49-18.jpg".
// Пусто/мусор — честный "frame.jpg", а не падение экспорта.
export function snapshotFileName(timecode: string | null | undefined): string {
  if (typeof timecode !== "string") return "frame.jpg";
  const safe = timecode.replace(/[^0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return safe ? `${safe}.jpg` : "frame.jpg";
}

// Размер кадра: ширина ≤ maxWidth, пропорции честные. Нулевые dims
// (метаданные ещё не приехали) → {0,0}: захват такой кадр пропускает.
export function resolveSnapshotSize(
  naturalWidth: number,
  naturalHeight: number,
  maxWidth: number = SNAPSHOT_MAX_WIDTH,
): { width: number; height: number } {
  const w = Math.floor(naturalWidth);
  const h = Math.floor(naturalHeight);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return { width: 0, height: 0 };
  const cap = Math.max(1, Math.floor(maxWidth));
  if (w <= cap) return { width: w, height: h };
  return { width: cap, height: Math.max(1, Math.round((h * cap) / w)) };
}

const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";

// data-URL без btoa/atob: работает и в воркере, и в тестах.
export function frameToDataUrl(jpeg: Uint8Array): string {
  let binary = "";
  const CHUNK = 8192;
  for (let i = 0; i < jpeg.length; i += CHUNK) {
    binary += String.fromCharCode(...jpeg.subarray(i, i + CHUNK));
  }
  let base64 = "";
  for (let i = 0; i < binary.length; i += 3) {
    const a = binary.charCodeAt(i);
    const b = i + 1 < binary.length ? binary.charCodeAt(i + 1) : 0;
    const c = i + 2 < binary.length ? binary.charCodeAt(i + 2) : 0;
    const n = (a << 16) | (b << 8) | c;
    base64 += BASE64_CHARS[(n >> 18) & 63] + BASE64_CHARS[(n >> 12) & 63];
    base64 += i + 1 < binary.length ? BASE64_CHARS[(n >> 6) & 63] : "=";
    base64 += i + 2 < binary.length ? BASE64_CHARS[n & 63] : "=";
  }
  return `data:image/jpeg;base64,${base64}`;
}

export function escapeReviewHtml(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface VisualReviewRow {
  timecode: string;
  kindLabel: string;
  name: string;
  text: string;
  fileName: string | null;
  dataUrl: string | null;
}

// Самодостаточный .html: таймкод + тип + текст + превью в строку.
// Тёмные карточки в духе окна Comments; текст пользователя экранирован.
export function buildVisualReviewHtml(opts: {
  title: string;
  fps: number;
  frameCount: number;
  markerCount: number;
  rows: VisualReviewRow[];
}): string {
  const cards = opts.rows
    .map((r) => {
      const preview = r.dataUrl
        ? `<img class="thumb" src="${r.dataUrl}" alt="${escapeReviewHtml(r.fileName ?? "frame")}">`
        : `<div class="thumb missing">no frame</div>`;
      const fileLine = r.fileName ? `<div class="file">${escapeReviewHtml(r.fileName)}</div>` : "";
      const textLine = r.text.trim()
        ? `<div class="text">${escapeReviewHtml(r.text)}</div>`
        : "";
      return `<div class="card">${preview}<div class="body"><div class="tc">${escapeReviewHtml(r.timecode)} <span class="kind">${escapeReviewHtml(r.kindLabel)}</span></div><div class="name">${escapeReviewHtml(r.name)}</div>${textLine}${fileLine}</div></div>`;
    })
    .join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeReviewHtml(opts.title)}</title>
<style>
body{background:#1a1a1a;color:#eee;font:14px -apple-system,"SF Pro Text",Inter,sans-serif;margin:0;padding:24px}
h1{font-size:17px;font-weight:600;margin:0 0 4px}
.sub{color:#999;font-size:12px;margin-bottom:20px}
.card{display:flex;gap:16px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:12px 16px;margin-bottom:12px}
.thumb{width:240px;max-height:135px;object-fit:cover;border-radius:8px;flex:none;background:#000}
.thumb.missing{display:flex;align-items:center;justify-content:center;color:#777;font-size:12px;min-height:90px}
.body{min-width:0}
.tc{font:12px "SF Mono",Menlo,monospace;opacity:.6}
.kind{opacity:.8}
.name{font-size:15px;margin:4px 0}
.text{white-space:pre-wrap;margin:4px 0}
.file{font:12px "SF Mono",Menlo,monospace;opacity:.5;margin-top:6px}
</style>
</head>
<body>
<h1>${escapeReviewHtml(opts.title)}</h1>
<div class="sub">${opts.markerCount} markers · ${opts.frameCount} frames · ${opts.fps} fps</div>
${cards}
</body>
</html>`;
}

// Разбор пути на каталог и имя — оба сепаратора (mac/Windows).
export function splitDirName(path: string): { dir: string; base: string } {
  const sep = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  if (sep < 0) return { dir: "", base: path };
  return { dir: path.slice(0, sep), base: path.slice(sep + 1) };
}

// Папка кадров рядом с сохранённым файлом: "<имя>.review/".
export function snapshotDirForFile(savedPath: string, stem: string): string {
  const { dir } = splitDirName(savedPath);
  const folder = `${stem}.review`;
  return dir ? `${dir}/${folder}` : folder;
}
