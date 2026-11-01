// tb_1793125816_99982_1: живой якорь комментария.
//
// Окно Comments открывалось на ?at= с момента первого M и залипало на нём,
// пока оператор смотрел дальше. Теперь главное окно публикует текущий
// плейхед, а Save берёт последний якорь — но только для СВОЕГО media.
//
// Два транспорта (паттерн playlist:play / markers:seek):
// - Tauri: событие "player:comment-anchor" — storage между вебвью не ходит;
// - браузер/dev: localStorage-ключ, 'storage' стреляет в чужом документе.
export const COMMENT_ANCHOR_KEY = "vetka_player_lab_comment_anchor_v1";

export const COMMENT_ANCHOR_EVENT = "player:comment-anchor";

// Якорь обновляется на каждом timeupdate, так что старый ключ — это либо
// прошлая сессия, либо давно закрытое главное окно. Час — с запасом: пока
// плеер жив, якорь свежий; пауза дольше часа честно откатывается на ?at=,
// который равен той же точке паузы.
export const COMMENT_ANCHOR_MAX_AGE_MS = 60 * 60 * 1000;

export interface CommentAnchor {
  media: string;
  sec: number;
  at: number;
}

export function parseCommentAnchor(raw: string | null | undefined, now: number = Date.now()): CommentAnchor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CommentAnchor>;
    const sec = Number(parsed?.sec);
    const at = Number(parsed?.at);
    const media = typeof parsed?.media === "string" ? parsed.media : "";
    if (!Number.isFinite(sec) || sec < 0) return null;
    if (!media) return null;
    if (!Number.isFinite(at) || now - at < 0 || now - at > COMMENT_ANCHOR_MAX_AGE_MS) return null;
    return { media, sec, at };
  } catch {
    return null;
  }
}

export function encodeCommentAnchor(media: string, sec: number, now: number = Date.now()): string {
  return JSON.stringify({ media, sec: Math.max(0, Number(sec || 0)), at: now } satisfies CommentAnchor);
}

/**
 * Якорь для Save: живой плейхед — только если он принадлежит тому же media,
 * что и окно Comments. Иначе — точка открытия окна (?at=).
 */
export function selectCommentAnchor(input: { live?: CommentAnchor | null; media: string | null; urlAt: number; now?: number }): number {
  const urlAt = Math.max(0, Number(input.urlAt || 0));
  const live = input.live;
  if (!live || !input.media) return urlAt;
  if (live.media !== input.media) return urlAt;
  const now = input.now ?? Date.now();
  if (!Number.isFinite(live.sec) || live.sec < 0) return urlAt;
  if (Number.isFinite(live.at) && live.at > 0 && now - live.at > COMMENT_ANCHOR_MAX_AGE_MS) return urlAt;
  return live.sec;
}

/** Главное окно: опубликовать текущий плейхед. Без media — молчим. */
export function publishCommentAnchor(media: string | null | undefined, sec: number): void {
  if (!media) return;
  const safeSec = Math.max(0, Number(sec || 0));
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    import("@tauri-apps/api/event").then(({ emit }) => {
      emit(COMMENT_ANCHOR_EVENT, { media, sec: safeSec }).catch(() => {});
    }).catch(() => {});
  }
  try {
    window.localStorage.setItem(COMMENT_ANCHOR_KEY, encodeCommentAnchor(media, safeSec));
  } catch {
    // storage недоступен — Tauri-событие всё равно доставит якорь
  }
}
