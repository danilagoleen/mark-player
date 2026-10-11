// 0.10.26 — resolveExternalMarkers: standalone-панель комментов пишет
// маркеры в localStorage напрямую; главное окно подхватывает чужие записи
// через storage-слушатель (свои записи слушатель не ловит — эха нет).
export interface ExternalMarker {
  marker_id: string;
  [key: string]: unknown;
}

// tb_1791654032_27281_1: storage-события между вебвью Tauri не ходят —
// панель будит главное окно событием (паттерн playlist:reload): главная
// сторона перечитывает маркеры из хранилища. Иначе правка панели
// (в т.ч. удаление) тихо затирается следующим персистом главного окна.
export const MARKERS_RELOAD_EVENT = "markers:reload";

// tb_1791663832_27409_5: главное окно переключило видео — открытое окно
// Markers должно перецелиться, иначе залипает на прошлом (оператор отвечал
// не на те вопросы). Rust open_panel_window умеет location.replace, но со
// steal focus — для автослежения не годится. Шлём событие без фокуса,
// окно само обновляет state.
export const MEDIA_CHANGED_EVENT = "player:media-changed";

export interface MediaChangedPayload {
  mediaKey: string | null;
  contentHash: string | null;
}

/** Главная сторона: сказать окну Markers «теперь это видео» (окна может не быть — best-effort). */
export function notifyMediaChanged(payload: MediaChangedPayload): void {
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    import("@tauri-apps/api/event").then(({ emitTo }) => {
      emitTo("panel-comments", MEDIA_CHANGED_EVENT, payload).catch(() => {});
    }).catch(() => {});
  }
}

/** Оконная сторона: identity из события новее ?media= (окно открыли раньше, видео переключили позже). */
export function resolveEffectiveMedia(
  queryMedia: string | null,
  queryHash: string | null,
  override: MediaChangedPayload | null,
): MediaIdentity {
  if (override) return { mediaKey: override.mediaKey, contentHash: override.contentHash };
  return { mediaKey: queryMedia, contentHash: queryHash };
}

/** Панельная сторона: сказать главному окну «перечитай маркеры». */
export function notifyMarkersReloaded(): void {
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    import("@tauri-apps/api/event").then(({ emit }) => {
      emit(MARKERS_RELOAD_EVENT, {}).catch(() => {});
    }).catch(() => {});
  }
  // web: setItem уже стрельнул storage в чужом документе — делать нечего.
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
