// tb_1792532431_93509_9: проводка четырёх событий показа (пауза, смена
// записи, ответ, закрытие окна) живёт здесь, а не в App.tsx, чтобы её можно
// было проверить без поднятия всего плеера. App только собирает снимок
// текущего состояния и зовёт pause/entryChange/answered/close.
import {
  buildSessionReport,
  writeSessionReport,
  type SessionEntryRef,
  type SessionMark,
  type SessionReach,
  type SessionReport,
} from "./sessionReport";

/** Метка в том виде, как её держит плеер: media_path решает принадлежность. */
export interface SessionMarkSource {
  media_path?: string | null;
  kind: string;
  start_sec: number;
}

export interface SessionSnapshot {
  playlist: string;
  entries: SessionEntryRef[];
  entryIndex: number;
  questionId: string | null;
  path: string | null;
  /** Ключ текущего медиа; метки пишутся и по нему, не только по path. */
  mediaKey?: string | null;
  tSec: number;
  playing: boolean;
  answers: number;
  marks: SessionMarkSource[];
}

export interface SessionSnapshotPatch {
  tSec?: number;
  playing?: boolean;
}

export interface SessionReporterDeps {
  /** Текущее состояние плеера; null — показывать нечего (нет плейлиста). */
  snapshot: () => SessionSnapshot | null;
  now?: () => string;
  write?: (report: SessionReport) => Promise<unknown>;
}

export interface SessionReporter {
  writeSnapshot(patch?: SessionSnapshotPatch): Promise<void>;
  pause(tSec: number): Promise<void>;
  entryChange(tSec?: number): Promise<void>;
  answered(): Promise<void>;
  close(tSec: number): Promise<void>;
}

interface ReporterState {
  playlist: string;
  startedAt: string;
  reached: SessionReach[];
}

export function createSessionReporter(deps: SessionReporterDeps): SessionReporter {
  const nowOf = deps.now ?? (() => new Date().toISOString());
  const write = deps.write ?? ((report: SessionReport) => writeSessionReport(report));
  const state: ReporterState = { playlist: "", startedAt: "", reached: [] };

  function writeSnapshot(patch: SessionSnapshotPatch = {}): Promise<void> {
    const snap = deps.snapshot();
    if (!snap || !snap.playlist) return Promise.resolve();

    const now = nowOf();
    if (state.playlist !== snap.playlist) {
      // другой плейлист — другой показ: reached от старого не тащим.
      state.playlist = snap.playlist;
      state.startedAt = now;
      state.reached = [];
    } else if (!state.startedAt) {
      state.startedAt = now;
    }

    const tSec = Number.isFinite(Number(patch.tSec)) ? Number(patch.tSec) : snap.tSec;
    const ownIndex = snap.path
      ? snap.entries.findIndex((entry) => entry?.path === snap.path)
      : -1;
    if (ownIndex >= 0) {
      const prev = state.reached.find((item) => item.entry_index === ownIndex);
      if (prev) prev.t_sec = Math.max(prev.t_sec, tSec);
      else state.reached.push({ entry_index: ownIndex, t_sec: tSec });
    }

    // media_path берём в момент вызова: снимок свежий, замыкание ничего
    // не кэширует (иначе метки по mediaKey терялись при первом рендере).
    const mediaKey = snap.mediaKey ?? null;
    const marks: SessionMark[] = (Array.isArray(snap.marks) ? snap.marks : [])
      .filter((mark) => !!mark.media_path && (mark.media_path === snap.path || mark.media_path === mediaKey))
      .map((mark) => ({ kind: mark.kind as SessionMark["kind"], t_sec: Number(mark.start_sec) }))
      .filter((mark) => Number.isFinite(mark.t_sec) && mark.t_sec >= 0);

    const report = buildSessionReport({
      playlist: snap.playlist,
      entries: snap.entries,
      startedAt: state.startedAt,
      updatedAt: now,
      entryIndex: ownIndex >= 0 ? ownIndex : snap.entryIndex,
      questionId: snap.questionId,
      path: snap.path,
      tSec,
      playing: patch.playing ?? snap.playing,
      reached: state.reached,
      answers: snap.answers,
      marks,
    });
    return write(report).then(() => {}).catch(() => {});
  }

  return {
    writeSnapshot,
    pause: (tSec) => writeSnapshot({ tSec, playing: false }),
    entryChange: (tSec = 0) => writeSnapshot({ tSec }),
    answered: () => writeSnapshot({}),
    close: (tSec) => writeSnapshot({ tSec, playing: false }),
  };
}
