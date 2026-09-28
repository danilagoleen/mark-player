/**
 * Различитель single/double click (Шаг 3/7, даблклик-фулскрин).
 * Одиночный срабатывает с задержкой delayMs; второй клик внутри окна
 * отменяет одиночный и стреляет двойным — приоритет даблклика.
 * ВАЖНО: инстанс хранить в ref — ре-рендеры не должны ронять pending-таймер.
 */
export interface SingleDoubleClick {
  click(): void;
  dispose(): void;
}

export function createSingleDoubleClick(
  onSingle: () => void,
  onDouble: () => void,
  delayMs = 250,
): SingleDoubleClick {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    click() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
        onDouble();
        return;
      }
      timer = setTimeout(() => {
        timer = null;
        onSingle();
      }, delayMs);
    },
    dispose() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
