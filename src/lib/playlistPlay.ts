// tb_1791233039_7043_3: клик по пункту плейлиста → открывается и играет.
//
// Два транспорта под два рантайма (паттерн markers:seek, зеркально):
// - Tauri: событие "playlist:play" {path} — главное окно слушает;
// - браузер/dev: localStorage-ключ — 'storage' стреляет только в ЧУЖОМ
//   документе, т.е. главное окно получает, панель — нет. Свежесть — метка at.
// Сам play() делает главное окно: флаг autoplay потребляется в onLoadedData
// (раньше декодер play ронял — src ещё не применён).
export const PLAYER_PLAY_REQUEST_KEY = "vetka_player_lab_play_request_v1";

export const PLAY_REQUEST_MAX_AGE_MS = 15_000;

// tb_1791563210_29299_4: плейлист перечитали из файла — уже открытая панель
// сама не узнает (storage между вебвью Tauri не доходит), шлём событие.
export const PLAYLIST_RELOAD_EVENT = "playlist:reload";

/** Главная сторона: сказать панели «перечитай плейлист из хранилища». */
export function notifyPlaylistReloaded(): void {
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    import("@tauri-apps/api/event").then(({ emit }) => {
      emit(PLAYLIST_RELOAD_EVENT, {}).catch(() => {});
    }).catch(() => {});
  }
  // web: savePlaylist уже стрельнул storage в чужом документе — делать нечего.
}

export interface PlayRequest {
  path: string;
  at: number;
  /** tb_1791521998_11250_5: вопрос плейлиста — главное окно поднимет карточку */
  questionId?: string;
  // tb_1791876286_57716_1: точная запись (сиблинги A/B делят qid, trk-10 —
  // и path+qid): first-match поднимал A при клике на B. Панель везёт entry
  // целиком (plain JSON) + индекс; главное окно валидирует оба.
  entry?: Record<string, unknown>;
  entryIndex?: number;
}

function cleanEntry(raw: unknown): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  return raw as Record<string, unknown>;
}

function cleanIndex(raw: unknown): number | undefined {
  return typeof raw === "number" && Number.isInteger(raw) && raw >= 0 ? raw : undefined;
}

export function parsePlayRequest(raw: string | null | undefined, now: number = Date.now()): Pick<PlayRequest, "path" | "questionId" | "entry" | "entryIndex"> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PlayRequest>;
    const path = parsed?.path;
    const at = Number(parsed?.at);
    if (typeof path !== "string" || path.length === 0) return null;
    if (!Number.isFinite(at) || now - at < 0 || now - at > PLAY_REQUEST_MAX_AGE_MS) return null;
    const questionId = typeof parsed?.questionId === "string" && parsed.questionId.length > 0
      ? parsed.questionId
      : undefined;
    const out: Pick<PlayRequest, "path" | "questionId" | "entry" | "entryIndex"> = { path, questionId };
    const entry = cleanEntry(parsed?.entry);
    if (entry) out.entry = entry;
    const entryIndex = cleanIndex(parsed?.entryIndex);
    if (entryIndex !== undefined) out.entryIndex = entryIndex;
    return out;
  } catch {
    return null;
  }
}

export function encodePlayRequest(path: string, now: number = Date.now(), questionId?: string, entry?: Record<string, unknown>, entryIndex?: number): string {
  return JSON.stringify({ path, at: now, questionId, entry, entryIndex } satisfies PlayRequest);
}

/** Панельная сторона: попросить главное окно открыть и играть. Возвращает транспорт. */
export function requestPlaylistPlay(path: string, questionId?: string, entry?: Record<string, unknown>, entryIndex?: number): "tauri" | "storage" {
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    import("@tauri-apps/api/event").then(({ emit }) => {
      emit("playlist:play", { path, questionId, entry, entryIndex }).catch(() => {});
    }).catch(() => {});
    return "tauri";
  }
  try {
    window.localStorage.setItem(PLAYER_PLAY_REQUEST_KEY, encodePlayRequest(path, Date.now(), questionId, entry, entryIndex));
  } catch {
    // storage недоступен — открытия не будет, панель остаётся списком
  }
  return "storage";
}
