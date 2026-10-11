import { exportCommentsToText } from "../srtUtils";
import type { ReviewNoteInput } from "../srtUtils";

// tb_1791568763_28503_3: Review Notes на весь плейлист — ОДИН общий
// документ по всем файлам подряд (решение оператора 09.10). Чистая
// функция: склейка посекционных текстов single-экспортёра. Только EN
// (вердикт Белла по видимым строкам — файл читает продюсер).
export interface PlaylistReviewSection {
  fileName: string;
  markers: ReviewNoteInput[];
  fps: number;
  /** Строка честности секции (fpsMismatchNote текущего / фолбэк чужих). */
  honestyNote?: string | null;
  // tb_1791568769_28503_4: ссылка на кадр у строки (html-ревью плейлиста
  // пишет тот же .txt, что одиночный visual-экспорт — с [frame: …]).
  frameNameOf?: (marker: ReviewNoteInput & { marker_id?: string }) => string | null;
}

export function buildPlaylistReviewText(
  playlistName: string,
  sections: PlaylistReviewSection[],
): string {
  const L: string[] = [`Review notes — ${playlistName || "playlist"}`];
  sections.forEach((s, i) => {
    L.push(`=== ${i + 1}. ${s.fileName} ===`);
    if (s.honestyNote) L.push(s.honestyNote);
    if (!s.markers.length) {
      L.push("(no markers)");
      return;
    }
    // Без header: он уже общий сверху.
    L.push(exportCommentsToText(s.markers, s.fps, undefined, s.frameNameOf));
  });
  return L.join("\n");
}
