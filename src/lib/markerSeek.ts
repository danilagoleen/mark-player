// tb_1791146301_70644_17: прыжок плейхеда из окна всех маркеров.
//
// Два транспорта под два рантайма (паттерн playlist:play):
// - Tauri: событие "markers:seek" {sec} — главное окно слушает;
// - браузер/dev: localStorage-ключ — 'storage' стреляет только в ЧУЖОМ
//   документе, т.е. главное окно получает, панель — нет. Свежесть — метка at.
export const PLAYER_SEEK_REQUEST_KEY = "vetka_player_lab_seek_v1";

export const SEEK_REQUEST_MAX_AGE_MS = 15_000;

export interface SeekRequest {
  sec: number;
  at: number;
}

export function parseSeekRequest(raw: string | null | undefined, now: number = Date.now()): number | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SeekRequest>;
    const sec = Number(parsed?.sec);
    const at = Number(parsed?.at);
    if (!Number.isFinite(sec) || sec < 0) return null;
    if (!Number.isFinite(at) || now - at < 0 || now - at > SEEK_REQUEST_MAX_AGE_MS) return null;
    return sec;
  } catch {
    return null;
  }
}

export function encodeSeekRequest(sec: number, now: number = Date.now()): string {
  return JSON.stringify({ sec: Math.max(0, Number(sec || 0)), at: now } satisfies SeekRequest);
}

/** Панельная сторона: попросить главное окно прыгнуть. Возвращает транспорт. */
export function requestPlayerSeek(sec: number): "tauri" | "storage" {
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    import("@tauri-apps/api/event").then(({ emit }) => {
      emit("markers:seek", { sec }).catch(() => {});
    }).catch(() => {});
    return "tauri";
  }
  try {
    window.localStorage.setItem(PLAYER_SEEK_REQUEST_KEY, encodeSeekRequest(sec));
  } catch {
    // storage недоступен — прыжка не будет, панель остаётся списком
  }
  return "storage";
}
