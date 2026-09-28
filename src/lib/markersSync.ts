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
