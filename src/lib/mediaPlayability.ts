// Open-gate (E2E 2026-09-24) — единая честная дверь для всех путей
// открытия: диалог, стартовый open files, drop, плейлист, ?src=, input.
//
// Отказ — только по ИЗВЕСТНО-плохому:
//   proxy        — контейнер, который <video> не переварит
//                  (mkv/avi/ts/…: нужен proxy-транскод, UPD 8 post-MVP);
//   unsupported  — заведомо не медиа по MIME (text/*, application/* …).
// Всё остальное — permissive native: судить — дело <video> и probe-бейджа.

export type MediaPlayability = "native" | "proxy" | "unsupported";

// Единый источник для диалоговых фильтров Finder (open-gate 1.1):
// диалог показывает только то, что <video>/<img> переварят.
export const NATIVE_VIDEO_EXT = ["mp4", "m4v", "mov", "webm", "ogv", "ogg", "m3u8"];

export const NATIVE_IMAGE_EXT = [
  "png", "jpg", "jpeg", "webp", "gif", "bmp", "tif", "tiff",
  "avif", "heic", "heif", "svg",
];

// Аудио-носители (P3 tb_1791571305_29299_2): <video> играет их не хуже
// видео — есть звук, длительность, шкала и маркеры, нет только картинки.
// Без них wav/m4a из плейлиста заминок уходили в unsupported по MIME и
// молча не открывались (оператору нечем было ставить маркеры).
export const NATIVE_AUDIO_EXT = [
  "wav", "m4a", "mp3", "aac", "flac", "oga", "opus",
  "aif", "aiff", "aifc", "caf",
];

const NATIVE_EXT = new Set([...NATIVE_VIDEO_EXT, ...NATIVE_IMAGE_EXT, ...NATIVE_AUDIO_EXT]);

const PROXY_EXT = new Set([
  "mkv", "avi", "ts", "m2ts", "mts", "wmv", "flv",
  "mpg", "mpeg", "3gp", "3g2", "vob", "asf", "rm",
]);

/** Расширение нижним регистром без точки; query/hash отрезаются. */
export function mediaExtension(pathOrName: string): string {
  const clean = pathOrName.split(/[?#]/, 1)[0];
  const tail = clean.split("/").pop() ?? clean;
  const dot = tail.lastIndexOf(".");
  if (dot <= 0 || dot === tail.length - 1) return "";
  const ext = tail.slice(dot + 1).toLowerCase();
  return /^[a-z0-9]{1,5}$/.test(ext) ? ext : "";
}

export function mediaPlayability(pathOrName: string, mimeType = ""): MediaPlayability {
  const ext = mediaExtension(pathOrName);
  if (ext) {
    if (NATIVE_EXT.has(ext)) return "native";
    if (PROXY_EXT.has(ext)) return "proxy";
  }
  const mime = mimeType.toLowerCase();
  if (mime.startsWith("video/") || mime.startsWith("image/") || mime.startsWith("audio/")) return "native";
  if (mime && mime !== "application/octet-stream") return "unsupported";
  // Нет хромых улик (нет расширения, нет MIME) — не судим.
  return "native";
}

/** Аудио-носитель (по расширению или MIME): играется тем же <video>,
 *  что и видео, — шкала, плейхед и маркеры работают как у видео. */
export function isAudioMedia(pathOrName: string, mimeType = ""): boolean {
  const ext = mediaExtension(pathOrName);
  if (ext && NATIVE_AUDIO_EXT.includes(ext)) return true;
  return mimeType.toLowerCase().startsWith("audio/");
}

/** Человекочитаемая причина отказа для тоста.
 * 1.2: только EN (пользовательские строки — international English),
 * без warning-тона: это модульный оффер (паттерн chat-модуля) —
 * предлагаем Pro engine, а не отказываем. */
export function mediaRefusalReason(pathOrName: string, playability: MediaPlayability): string {
  const name = pathOrName.split("/").pop() || pathOrName || "file";
  if (playability === "proxy") {
    return `"${name}" needs the Pro engine (proxy transcode, post-MVP) — file not opened.`;
  }
  return `"${name}" is not media — file not opened.`;
}
