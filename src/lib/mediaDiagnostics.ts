// tb_1792438559_20717_1: почему большой proxy молчит.
//
// Tauri asset protocol кормит <video> через WKWebView custom scheme. На macOS
// он ломается на файлах > ~3.5-4 ГиБ (tauri#6375, tauri#7355) — файл либо
// висит без кадра, либо падает без onError, то есть «не играет» молча.
// moov-at-end усугубляет: декодеру нужен индекс в конце (сик к 2015с из
// 3426с — это ~4 ГБ от начала), и запрос уходит за границу, где протокол
// врёт. Знаем контейнер — говорим оператору причину вслух, а не чёрным экраном.

export interface MediaContainerInfo {
  size: number;
  moov_offset: number | null;
  mdat_offset: number | null;
  moov_at_end: boolean;
}

// Порог из upstream-репортов: ~3.5 GiB уже роняло asset-протокол при сике.
export const BIG_MEDIA_BYTES = 3.5 * 1024 ** 3;

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

/** Точная связка, из-за которой молчит именно этот файл: >4 GB + индекс в конце. */
export function isLargeNonFaststart(info: MediaContainerInfo): boolean {
  return info.size >= BIG_MEDIA_BYTES && info.moov_at_end;
}

/** Стоит ли предупредить ДО попытки (причина уже известна, прятать её незачем). */
export function shouldWarnBeforePlayback(info: MediaContainerInfo | null): boolean {
  return info != null && isLargeNonFaststart(info);
}

/** Упреждающее уведомление на открытии: ещё не упало, но причина почти наверняка сработает. */
export function mediaRiskNotice(pathOrName: string, info: MediaContainerInfo): string {
  const name = baseName(pathOrName);
  const size = formatFileSize(info.size);
  return `"${name}" (${size}) is unlikely to play: its index (moov) sits at the end of a file over the ~4 GB desktop media-bridge limit (Tauri/WebKit #6375/#7355). If it stays black, rewrap with -movflags +faststart or open the smaller proxy.`;
}

/** Человекочитаемая причина, почему файл не проигрывается (EN, тон — факт, не warning). */
export function mediaLoadProblemReason(pathOrName: string, info: MediaContainerInfo): string {
  const name = baseName(pathOrName);
  const size = formatFileSize(info.size);
  if (isLargeNonFaststart(info)) {
    return `"${name}" (${size}) can't be streamed: its index (moov) sits at the end and the desktop media bridge fails on files this large (Tauri/WebKit #6375/#7355). Rewrap with -movflags +faststart, or open the smaller proxy — playback will not start here.`;
  }
  if (info.moov_at_end) {
    return `"${name}" keeps its index (moov) at the end; seeking may stall. Rewrap with -movflags +faststart if playback freezes.`;
  }
  if (info.size >= BIG_MEDIA_BYTES) {
    return `"${name}" (${size}) is above the ~4 GB desktop playback limit — it may stay black. Use a faststart proxy if it does.`;
  }
  return `"${name}" did not start: the desktop media bridge returned no decodable stream. Try a faststart proxy.`;
}
