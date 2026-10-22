// tb_1792532431_93509_9: проводка четырёх событий отчёта о показе.
// Без App: снимок подменяется моками, проверяется сам recorder.
import { describe, expect, it, vi } from "vitest";
import { createSessionReporter, type SessionSnapshot } from "./sessionReporter";
import { buildSessionReport, isSessionReport, type SessionReport } from "./sessionReport";

const PLAYLIST = "/idx/reel_candidates_v03.json";
const ENTRIES = [
  { path: "/Volumes/tempwork/a/P1755050.MOV", question_id: "q00" },
  { path: "/Volumes/tempwork/a/P1755051.MOV", question_id: "q07" },
];

function snapshot(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    playlist: PLAYLIST,
    entries: ENTRIES,
    entryIndex: 1,
    questionId: "q07",
    path: ENTRIES[1].path,
    mediaKey: ENTRIES[1].path,
    tSec: 10,
    playing: true,
    answers: 2,
    marks: [{ media_path: ENTRIES[1].path, kind: "favorite", start_sec: 5 }],
    ...overrides,
  };
}

function setup(initial: SessionSnapshot | null = snapshot()) {
  let current = initial;
  const writes: SessionReport[] = [];
  const write = vi.fn(async (report: SessionReport) => {
    writes.push(report);
  });
  const reporter = createSessionReporter({
    snapshot: () => current,
    now: () => "2026-10-21T09:12:03.120Z",
    write,
  });
  return {
    reporter,
    writes,
    write,
    setSnapshot: (next: SessionSnapshot | null) => {
      current = next;
    },
  };
}

describe("createSessionReporter: четыре события", () => {
  it("пауза пишет позицию и playing:false", async () => {
    const { reporter, writes, write } = setup();
    await reporter.pause(812.4);

    expect(write).toHaveBeenCalledTimes(1);
    const report = writes[0];
    expect(report.t_sec).toBe(812.4);
    expect(report.playing).toBe(false);
    expect(report.entry_index).toBe(1);
    expect(report.path).toBe(ENTRIES[1].path);
    expect(report.reached).toEqual([{ entry_index: 1, t_sec: 812.4 }]);
  });

  it("смена записи пишет t_sec 0 и добавляет её в reached", async () => {
    const { reporter, writes, setSnapshot } = setup();
    await reporter.pause(34.2);
    setSnapshot(snapshot({ entryIndex: 0, questionId: "q00", path: ENTRIES[0].path, tSec: 0, marks: [] }));
    await reporter.entryChange();

    const report = writes[1];
    expect(report.t_sec).toBe(0);
    expect(report.entry_index).toBe(0);
    expect(report.reached).toEqual([
      { entry_index: 0, t_sec: 0 },
      { entry_index: 1, t_sec: 34.2 },
    ]);
  });

  it("ответ пишет актуальное число ответов, не трогая позицию", async () => {
    const { reporter, writes, setSnapshot } = setup();
    setSnapshot(snapshot({ answers: 3, tSec: 77 }));
    await reporter.answered();

    expect(writes[0].answers).toBe(3);
    expect(writes[0].t_sec).toBe(77);
    expect(writes[0].playing).toBe(true);
  });

  it("закрытие окна пишет последнюю позицию и playing:false", async () => {
    const { reporter, writes } = setup();
    await reporter.close(55.5);

    expect(writes[0].t_sec).toBe(55.5);
    expect(writes[0].playing).toBe(false);
  });

  it("смена плейлиста сбрасывает started_at и reached", async () => {
    let now = "2026-10-21T09:12:03.120Z";
    let current = snapshot();
    const writes: SessionReport[] = [];
    const reporter = createSessionReporter({
      snapshot: () => current,
      now: () => now,
      write: async (report) => {
        writes.push(report);
      },
    });
    await reporter.pause(10);
    now = "2026-10-21T10:00:00.000Z";
    current = snapshot({ playlist: "/idx/other.json", entries: [{ path: "/idx/x.MOV" }], entryIndex: 0, path: "/idx/x.MOV", questionId: null });
    await reporter.pause(1);

    expect(writes[1].started_at).toBe("2026-10-21T10:00:00.000Z");
    expect(writes[1].reached).toEqual([{ entry_index: 0, t_sec: 1 }]);
  });

  it("метки по mediaKey (не по path) попадают в отчёт", async () => {
    const { reporter, writes } = setup(snapshot({
      mediaKey: "blob:d739c0",
      marks: [
        { media_path: "blob:d739c0", kind: "favorite", start_sec: 12.5 },
        { media_path: "/elsewhere/other.MOV", kind: "negative", start_sec: 1 },
      ],
    }));
    await reporter.pause(20);

    expect(writes[0].marks).toEqual([{ kind: "favorite", t_sec: 12.5 }]);
  });

  it("mediaKey читается в момент события, а не при создании reporter", async () => {
    const { reporter, writes, setSnapshot } = setup(snapshot({
      mediaKey: "",
      marks: [{ media_path: "blob:first", kind: "comment", start_sec: 3 }],
    }));
    await reporter.answered();
    expect(writes[0].marks).toEqual([]);

    setSnapshot(snapshot({
      mediaKey: "blob:first",
      marks: [{ media_path: "blob:first", kind: "comment", start_sec: 3 }],
    }));
    await reporter.answered();
    expect(writes[1].marks).toEqual([{ kind: "comment", t_sec: 3 }]);
  });

  it("без плейлиста не пишет ничего", async () => {
    const { reporter, write } = setup(null);
    await reporter.pause(1);
    expect(write).not.toHaveBeenCalled();
  });
});

describe("buildSessionReport: нет активной записи", () => {
  it("entry_index честный -1, когда path не из плейлиста", async () => {
    const report = buildSessionReport({
      playlist: PLAYLIST,
      entries: ENTRIES,
      startedAt: "2026-10-21T09:12:03.120Z",
      path: null,
      questionId: null,
      marks: [{ kind: "favorite", t_sec: 1 }],
    });

    expect(report.entry_index).toBe(-1);
    expect(report.path).toBeNull();
    expect(report.marks).toEqual([]);
    expect(isSessionReport(report)).toBe(true);
  });
});
