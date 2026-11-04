// tb_1793567711_43420_2: маркеры, рождённые вне эффекта «markers → LS»
// (материализация плейлиста из меню и очереди агента), должны лежать в
// хранилище ДО того, как кто-либо эмитит markers:changed. Главное окно слушает
// и СВОЁ эхо (setMarkers(readStoredMarkers())): пока запись шла эффектом после
// рендера, эхо читало старый LS и затирало свежие маркеры — на плейлисте
// beta-focus-check-f1 (0.26.7) ack говорил materialized=35, а в LS их не было.

export interface MarkersStorageLike {
  setItem(key: string, value: string): void;
}

/**
 * Дописывает fresh к current, СИНХРОННО кладёт слитый массив в хранилище и
 * возвращает его (его же отдаём в setMarkers). Нет fresh — ничего не пишем.
 * Ошибка хранилища (квота, запрет) открытие плейлиста не роняет: маркеры
 * остаются в состоянии, а эффект запишет их позже, как раньше.
 */
export function appendMarkersPersisted<T>(
  current: readonly T[],
  fresh: readonly T[],
  storage: MarkersStorageLike | null | undefined,
  key: string,
): T[] {
  if (fresh.length === 0) return current as T[];
  const merged = [...current, ...fresh];
  if (!storage) return merged;
  try {
    storage.setItem(key, JSON.stringify(merged));
  } catch {
    // запись не вышла — состояние остаётся источником, эффект повторит запись
  }
  return merged;
}
