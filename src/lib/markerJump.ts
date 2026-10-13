// tb_1791860202_84020_2: прыжок по маркеру во время play — сначала пауза,
// потом прыжок (как в Premiere). Иначе плейхед рвётся между двумя
// противоречивыми командами: play тянет вперёд, seek дёргает к маркеру.
export interface PausableVideo {
  readonly paused: boolean;
  pause(): void;
}

// Ставит видео на паузу, только если оно играет. Возвращает true, если
// пауза была выставлена (т.е. прыжок шёл из play).
export function pauseBeforeMarkerJump(video: PausableVideo | null | undefined): boolean {
  if (!video || video.paused) return false;
  video.pause();
  return true;
}
