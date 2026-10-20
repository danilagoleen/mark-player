// tb_1792441299_49541_7 + tb_1792443862_5828_1: scrub во время play на
// длинном аудио/прокси.
//
// WKWebView/asset-протокол не успевает за seek: каждый video.currentTime
// отменяет предыдущий seek, заново праймит аудио-пайплайн, звук глохнет,
// а UI рисует плейхед по отстающему currentTime — «тянет назад».
// Лечим двумя вещами: оптимистичным preview (плейхед идёт за курсором)
// и тем, что во время протяжки seek НЕ отправляется вообще — ровно один
// сик уходит на отпускании кнопки.

/** Страховка: если seeked не пришёл, preview не висит вечно. */
export const SCRUB_PREVIEW_TIMEOUT_MS = 1500;

/** Насколько фактическое время должно догнать preview, чтобы снять его. */
export const SCRUB_SETTLE_EPSILON_SEC = 0.2;

/** Декодер догнал запрошенную точку — preview можно снимать. */
export function isScrubSettled(
  preview: number,
  actual: number,
  epsilonSec: number = SCRUB_SETTLE_EPSILON_SEC,
): boolean {
  if (!Number.isFinite(preview) || !Number.isFinite(actual)) return false;
  return Math.abs(preview - actual) <= epsilonSec;
}
