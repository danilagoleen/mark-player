// tb_1792528229_79489_1: почему большой proxy молчал и что мы с этим сделали.
//
// Tauri asset protocol кормит <video> через WKWebView custom scheme. На macOS
// он перестаёт запрашивать данные медиа у файлов примерно от 5.2e9 Б: moov
// (индекс) ещё читается — длительность приходит, — а mdat не читается вовсе.
// Ни ошибки, ни onError: чёрный кадр, таймкод идёт. Порог замерен на реальном
// материале: 5 247 132 270 Б играет, 5 290 106 592 Б — нет; moov в конце,
// co64 и кодек ни при чём, +faststart не помогает (RAW-отчёт:
// docs/217_ph_cut-player/RECON_MARK_PLAYER_LARGE_MEDIA_2026-10-20.md).
//
// С 0.26 такие файлы уходят на loopback Range-сервер (src-tauri/range_server.rs)
// по http://127.0.0.1 — тот же файл там играет и сикается. Диагностика ниже
// осталась для случая, когда файл всё-таки не стартовал: она называет
// транспорт, а не размер, и больше не советует перепаковывать материал.

export interface MediaContainerInfo {
  size: number;
  moov_offset: number | null;
  mdat_offset: number | null;
  moov_at_end: boolean;
}

// Ниже этого порога asset:// работает; выше — включается loopback-транспорт.
// Держать в согласии с LOOPBACK_MIN_BYTES в src-tauri/src/range_server.rs.
export const BIG_MEDIA_BYTES = 5.25e9;

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const gib = bytes / 1024 ** 3;
  if (gib >= 1) return `${gib.toFixed(1)} GB`;
  const mib = bytes / 1024 ** 2;
  if (mib >= 1) return `${mib.toFixed(mib >= 10 ? 0 : 1)} MB`;
  const kib = bytes / 1024;
  if (kib >= 1) return `${Math.round(kib)} KB`;
  return `${Math.round(bytes)} B`;
}

function baseName(pathOrName: string): string {
  return pathOrName.split("/").pop() || pathOrName || "media";
}

/** Файл выше порога asset-транспорта — такой должен идти через loopback. */
export function isBeyondAssetTransport(info: MediaContainerInfo): boolean {
  return info.size >= BIG_MEDIA_BYTES;
}

/** Человекочитаемая причина, почему файл не проигрывается (EN, тон — факт, не warning). */
export function mediaLoadProblemReason(pathOrName: string, info: MediaContainerInfo): string {
  const name = baseName(pathOrName);
  const size = formatFileSize(info.size);
  if (isBeyondAssetTransport(info)) {
    return `"${name}" (${size}) is above the size where WebKit stops reading media over the desktop asset bridge (Tauri/WebKit #6375/#7355). Mark Player 0.26 streams such files through a local http Range server; it did not start here, so the file stayed black. Restart the app — if it repeats, the loopback transport could not bind (see console) and the file itself is fine.`;
  }
  return `"${name}" did not start: the desktop media bridge returned no decodable stream. The file may be damaged or use a codec the system cannot decode.`;
}
