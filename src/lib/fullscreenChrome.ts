// 0.12 слайс: автоскрытие хрома ТОЛЬКО в фулскрине.
// Вход прячет сразу (msSinceActivity = +Inf), движение мыши обнуляет счётчик,
// тишина дольше таймаута прячет снова. Оконный режим — всегда видим:
// плеер для маркирования, тулбары висят.
export const FULLSCREEN_CHROME_TIMEOUT_MS = 2000;

export function resolveChromeHidden(
  isFullscreen: boolean,
  msSinceActivity: number,
  timeoutMs: number = FULLSCREEN_CHROME_TIMEOUT_MS,
): boolean {
  if (!isFullscreen) return false;
  return msSinceActivity >= timeoutMs;
}
