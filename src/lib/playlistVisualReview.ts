import { formatTimecode, reviewMarkerName } from "../srtUtils";
import { frameToDataUrl } from "./frameSnapshots";
import type { VisualReviewRow } from "./frameSnapshots";

// tb_1791568769_28503_4: чистая сборка строк html-ревью плейлиста.
// Захват кадров — в App (живой <video>), здесь только склейка:
// таймкод посекционным fps + префикс секции в имени JPEG (таймкоды
// разных файлов совпадают — без префикса кадры перезаписали бы друг друга).
export interface PlaylistVisualMarker {
  marker_id: string;
  anchor_sec: number;
  kind: string;
  label: string;
  text: string;
  /** tb_1791583578_64923_1: автор (идёт в имя строкой reviewMarkerName). */
  author?: string;
  /** tb_1791585558_31907_1: ответ — пометка ↳ в имени. */
  reply_to?: string;
}

export interface PlaylistVisualFrame {
  marker_id: string;
  fileName: string;
  jpeg: Uint8Array;
}

export interface PlaylistVisualSection {
  /** Заголовок секции, напр. «1. clip.mp4». */
  title: string;
  markers: PlaylistVisualMarker[];
  fps: number;
  frames: Map<string, PlaylistVisualFrame>;
}

export function playlistFrameFileName(sectionIndex: number, frameFileName: string): string {
  return `${String(sectionIndex + 1).padStart(2, "0")}-${frameFileName}`;
}

export function buildPlaylistVisualRows(sections: PlaylistVisualSection[]): VisualReviewRow[] {
  const rows: VisualReviewRow[] = [];
  sections.forEach((s, si) => {
    for (const m of s.markers) {
      const f = s.frames.get(m.marker_id);
      rows.push({
        section: s.title,
        timecode: formatTimecode(m.anchor_sec, s.fps),
        kindLabel: m.kind,
        name: reviewMarkerName(m.kind, m.label, m.author, m.reply_to),
        text: m.text || "",
        fileName: f ? playlistFrameFileName(si, f.fileName) : null,
        dataUrl: f ? frameToDataUrl(f.jpeg) : null,
      });
    }
  });
  return rows;
}
