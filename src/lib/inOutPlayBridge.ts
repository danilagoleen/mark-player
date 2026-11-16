// tb_1794846994_51008_1 (Б): тумблер In–Out Play (ножницы) между окнами Tauri.
//
// Раньше окно Playlist писало состояние только в localStorage и ждало, что
// главное окно услышит 'storage'. Между вебвью Tauri 'storage' не приходит
// (tb_1791563210_29299_4) — главное окно оставалось на ON и прыгало с закрытой
// скобки OUT на следующий IN при выключенных ножницах на экране плейлиста.
// Тот же паттерн, что playlist:play / markers:seek: в Tauri — событие, в вебе —
// storage (там он доходит в чужой документ).

export const INOUT_PLAY_CHANGED_EVENT = "inout-play:changed";

function inTauri(): boolean {
  try {
    return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  } catch {
    return false;
  }
}

/** {enabled: boolean} → enabled; всё остальное — null (мусор не включает и не выключает). */
export function parseInOutPlayEvent(payload: unknown): boolean | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const enabled = (payload as { enabled?: unknown }).enabled;
  return typeof enabled === "boolean" ? enabled : null;
}

/** Сказать другим окнам «ножницы теперь enabled». Возвращает транспорт. */
export async function notifyInOutPlayChanged(enabled: boolean): Promise<"tauri" | "storage"> {
  if (!inTauri()) return "storage";
  try {
    const { emit } = await import("@tauri-apps/api/event");
    await emit(INOUT_PLAY_CHANGED_EVENT, { enabled });
  } catch (error) {
    console.warn("[Mark Player] inout-play:changed emit failed:", error);
  }
  return "tauri";
}

/** Слушать смену ножниц из другого окна. Вне Tauri — пустая отписка (там storage). */
export async function listenInOutPlayChanged(cb: (enabled: boolean) => void): Promise<() => void> {
  if (!inTauri()) return () => {};
  try {
    const { listen } = await import("@tauri-apps/api/event");
    const unlisten = await listen(INOUT_PLAY_CHANGED_EVENT, (event: { payload: unknown }) => {
      const enabled = parseInOutPlayEvent(event.payload);
      if (enabled !== null) cb(enabled);
    });
    return unlisten;
  } catch (error) {
    console.warn("[Mark Player] inout-play:changed listen failed:", error);
    return () => {};
  }
}
