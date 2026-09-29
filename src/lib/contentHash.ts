// 0.22 — content-hash identity маркеров.
//
// Вердикт research: embed SRT в контейнер отклонён (тащит ffmpeg 30–80MB,
// перезапись файла, потеря цветов/★✗). Вместо этого маркеры привязываются
// к СОДЕРЖИМОМУ видео: копия/переименование/перенос файла разметку не теряет.
//
// Хеш сэмплированный: SHA-256 от (версия | размер LE64 | голова 64KB | хвост
// 64KB). Полный проход по гигабайтам не нужен — коллизия практически
// исключена, чтение — два seek. Формат: "ch1:<hex64>".
// Нет байтов (браузер без subtle, ошибка чтения) — честный null, вызывающий
// падает на старое поведение (привязка к media_path).

export const CONTENT_HASH_VERSION = "ch1";
export const CONTENT_HASH_SAMPLE_BYTES = 64 * 1024;
export const CONTENT_HASH_MAX_SAMPLE_BYTES = 1 << 20;

export interface ContentSample {
  size: number;
  head: Uint8Array;
  tail: Uint8Array;
}

function toHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Детерминированный хеш сэмпла. subtle недоступен (не-secure контекст) —
// null, не мусор: вызывающий решает fallback сам.
export async function computeContentHash(
  size: number,
  head: Uint8Array,
  tail: Uint8Array,
): Promise<string | null> {
  try {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) return null;
    const sizeBuf = new ArrayBuffer(8);
    new DataView(sizeBuf).setBigUint64(0, BigInt(Math.max(0, Math.floor(size))), true);
    const tag = new TextEncoder().encode(`${CONTENT_HASH_VERSION}|`);
    const total = tag.length + 8 + head.length + tail.length;
    const input = new Uint8Array(total);
    input.set(tag, 0);
    input.set(new Uint8Array(sizeBuf), tag.length);
    input.set(head, tag.length + 8);
    input.set(tail, tag.length + 8 + head.length);
    const digest = await subtle.digest("SHA-256", input);
    return `${CONTENT_HASH_VERSION}:${toHex(digest)}`;
  } catch {
    return null;
  }
}

export function parseContentHash(value: string | null | undefined): { version: string; digest: string } | null {
  if (typeof value !== "string") return null;
  const sep = value.indexOf(":");
  if (sep <= 0) return null;
  const version = value.slice(0, sep);
  const digest = value.slice(sep + 1);
  if (!/^[0-9a-f]{64}$/.test(digest)) return null;
  return { version, digest };
}

// Короткая форма для UI: "ch1:9f2a…c41d". Мусор — как есть, не длиннее 24.
export function formatShortHash(hash: string | null | undefined): string {
  if (!hash) return "";
  const parsed = parseContentHash(hash);
  if (!parsed) return hash.length > 24 ? `${hash.slice(0, 24)}…` : hash;
  return `${parsed.version}:${parsed.digest.slice(0, 4)}…${parsed.digest.slice(-4)}`;
}

export function clampSampleBytes(requested: number | undefined): number {
  const n = Math.floor(requested ?? CONTENT_HASH_SAMPLE_BYTES);
  if (!Number.isFinite(n)) return CONTENT_HASH_SAMPLE_BYTES;
  return Math.max(1, Math.min(n, CONTENT_HASH_MAX_SAMPLE_BYTES));
}

// Браузерный тракт: File/Blob режутся без чтения целиком.
export async function sampleBlob(blob: Blob, sampleBytes: number = CONTENT_HASH_SAMPLE_BYTES): Promise<ContentSample> {
  const n = clampSampleBytes(sampleBytes);
  const size = blob.size;
  const headLen = Math.min(n, size);
  const tailLen = Math.min(n, size);
  const [headBuf, tailBuf] = await Promise.all([
    blob.slice(0, headLen).arrayBuffer(),
    blob.slice(Math.max(0, size - tailLen), size).arrayBuffer(),
  ]);
  return { size, head: new Uint8Array(headBuf), tail: new Uint8Array(tailBuf) };
}

export interface TauriFileSampleRaw {
  size: number;
  head: number[];
  tail: number[];
}

// Tauri-тракт: байты читает Rust-команда sample_file_bytes (два seek,
// файл целиком в память не грузится). Вне Tauri invoke падает — пробрасываем.
export async function sampleTauriFile(
  path: string,
  sampleBytes: number = CONTENT_HASH_SAMPLE_BYTES,
): Promise<ContentSample> {
  const { invoke } = await import("@tauri-apps/api/core");
  const raw = await invoke<TauriFileSampleRaw>("sample_file_bytes", {
    path,
    sampleLen: clampSampleBytes(sampleBytes),
  });
  return { size: raw.size, head: Uint8Array.from(raw.head), tail: Uint8Array.from(raw.tail) };
}
