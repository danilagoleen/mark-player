import { edlAscii } from "../srtUtils";
import type { SrtExportable } from "../srtUtils";

// tb_1791568777_28503_5: чистые сборщики медиа-экспортов плейлиста
// (JSON/SRT). EDL-склейка живёт в srtUtils.exportPlaylistToEdl рядом
// с событйной логикой. Принцип везде один: один общий документ,
// секции/лента по файлам подряд. Только EN в видимых строках.

export interface PlaylistJsonMarker {
  marker_id: string;
  kind: string;
  start_sec: number;
  end_sec: number;
  anchor_sec: number;
  label: string;
  text: string;
  /** tb_1791583578_64923_1: автор (agent:<роль> — пометка «ИИ”). */
  author?: string;
  /** tb_1791585558_31907_1: ссылка на родителя (ответ). */
  reply_to?: string;
  created_at?: string;
}

export interface PlaylistJsonEvent {
  provisional_event_id: string;
  event_type: string;
  start_sec: number;
  end_sec: number;
  text: string;
  created_at?: string;
}

export interface PlaylistJsonFile {
  file: string;
  markers: PlaylistJsonMarker[];
  provisional_events: PlaylistJsonEvent[];
}

// Схема playlist-markers/1: те же объекты маркеров, что single .sos.json
// (exportToSidecar), но пачкой по файлам. content_hash — на массивах
// маркеров нет (он медийный, в single — полем сайдкара); честно null,
// когда хеш файла неизвестен, — потребитель решает сам.
export function buildPlaylistMarkersJson(
  playlistName: string,
  files: PlaylistJsonFile[],
): string {
  // tb_1792634443_73606_2: два вопроса на один файл = две записи плейлиста,
  // но один файл. Секция — одна; маркеры/события дедуплицируются по id,
  // иначе каждый ответ оператора уезжает в экспорт дважды.
  const merged: PlaylistJsonFile[] = [];
  const byFile = new Map<string, PlaylistJsonFile>();
  for (const f of files) {
    const existing = byFile.get(f.file);
    if (!existing) {
      const copy: PlaylistJsonFile = {
        file: f.file,
        markers: [...f.markers],
        provisional_events: [...f.provisional_events],
      };
      byFile.set(f.file, copy);
      merged.push(copy);
      continue;
    }
    const markerKeys = new Set(existing.markers.map((m) => `${m.marker_id}|${m.kind}|${m.start_sec}`));
    for (const m of f.markers) {
      const key = `${m.marker_id}|${m.kind}|${m.start_sec}`;
      if (markerKeys.has(key)) continue;
      markerKeys.add(key);
      existing.markers.push(m);
    }
    const eventKeys = new Set(existing.provisional_events.map((e) => e.provisional_event_id));
    for (const e of f.provisional_events) {
      if (eventKeys.has(e.provisional_event_id)) continue;
      eventKeys.add(e.provisional_event_id);
      existing.provisional_events.push(e);
    }
  }
  return JSON.stringify(
    {
      playlist_markers_version: "1",
      source: "cut_player",
      playlist: playlistName || "playlist",
      generated_at: new Date().toISOString(),
      files: merged.map((f) => ({
        file: f.file,
        markers: f.markers.map((m) => ({
          marker_id: m.marker_id,
          kind: m.kind,
          start_sec: m.start_sec,
          end_sec: m.end_sec,
          anchor_sec: m.anchor_sec,
          label: m.label,
          text: m.text,
          author: m.author || "",
          reply_to: m.reply_to || "",
          created_at: m.created_at || "",
        })),
        provisional_events: f.provisional_events.map((e) => ({
          provisional_event_id: e.provisional_event_id,
          event_type: e.event_type,
          start_sec: e.start_sec,
          end_sec: e.end_sec,
          text: e.text,
          created_at: e.created_at || "",
        })),
      })),
    },
    null,
    2,
  );
}

// Сдвиг SRT-маркеров на смещение файла в сквозной ленте плейлиста.
// Нумерацию делает один вызов exportMarkersToSrtV2 поверх склейки.
export function shiftSrtMarkers(markers: SrtExportable[], offsetSec: number): SrtExportable[] {
  if (!offsetSec) return markers;
  return markers.map((m) => ({ ...m, start_sec: m.start_sec + offsetSec, end_sec: m.end_sec + offsetSec }));
}

// Reel-имя файла для EDL: ASCII-стем до 8 знаков (поле reel — 9 с V),
// мусор — PL+номер. Совпадение стемов исполнитель видит по порядку.
export function playlistReelName(fileName: string, index: number): string {
  const stem = (fileName.split(/[\\/]/).pop() || fileName).replace(/\.[^.]+$/, "");
  const ascii = (edlAscii(stem) || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 8);
  if (ascii) return ascii.toUpperCase();
  return `PL${String(index + 1).padStart(2, "0")}`;
}
