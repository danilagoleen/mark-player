// 0.10.26 — resolveExternalMarkers: standalone-панель комментов пишет
// маркеры в localStorage напрямую; главное окно подхватывает чужие записи
// через storage-слушатель (свои записи слушатель не ловит — эха нет).
export interface ExternalMarker {
  marker_id: string;
  [key: string]: unknown;
}

export function resolveExternalMarkers(raw: string | null | undefined): ExternalMarker[] | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const ok = parsed.every(
    (m) => m !== null && typeof m === "object" && typeof (m as { marker_id?: unknown }).marker_id === "string",
  );
  return ok ? (parsed as ExternalMarker[]) : null;
}

// 0.22 — identity медиа: content-hash содержимого + ключ пути.
// Маркер принадлежит медиа, если хеши совпали (копия/переименование —
// своё), иначе — легаси-фолбэк на media_path. Хеш известен, а у маркера
// чужой хеш — строго false: файл под тем же путём подменили, чужие
// метки показывать нельзя.
export interface MediaIdentity {
  mediaKey: string | null;
  contentHash: string | null;
}

export interface IdentityMarker {
  media_path?: string | null;
  content_hash?: string | null;
}

export function markerBelongsToMedia(marker: IdentityMarker, identity: MediaIdentity): boolean {
  if (
    identity.contentHash &&
    typeof marker.content_hash === "string" &&
    marker.content_hash.length > 0
  ) {
    return marker.content_hash === identity.contentHash;
  }
  if (!identity.mediaKey) return false;
  return marker.media_path === identity.mediaKey;
}
