// tb_1792532465_79489_1 — QA-PREP к tb_1792532431_93509_9 (Alpha).
// Контракт §5 разведки RECON_PLAYER_FOR_AGENT_2026-10-21: <плейлист>.session.json
// — отчёт о показе, отдельная правда от answers.json. Тесты пишет QA (anti-cheat).
import { describe, expect, it, vi } from "vitest";
import sessionReportSource from "./sessionReport.ts?raw";
import { answersPathFor } from "./questionPlaylist";
import {
  SESSION_VERSION,
  buildSessionReport,
  sessionPathFor,
  writeSessionReport,
  type SessionInput,
} from "./sessionReport";

const PLAYLIST = "/idx/reel_candidates_v03.json";
const ENTRIES = [
  { path: "/Volumes/tempwork/a/P1755050.MOV", question_id: "q00" },
  { path: "/Volumes/tempwork/a/P1755051.MOV", question_id: "q07" },
];

function input(overrides: Partial<SessionInput> = {}): SessionInput {
  return {
    playlist: PLAYLIST,
    entries: ENTRIES,
    startedAt: "2026-10-21T09:12:03.120Z",
    updatedAt: "2026-10-21T09:19:44.010Z",
    entryIndex: 1,
    questionId: "q07",
    path: ENTRIES[1].path,
    tSec: 812.4,
    playing: false,
    reached: [
      { entry_index: 0, t_sec: 34.2 },
      { entry_index: 1, t_sec: 812.4 },
    ],
    answers: 3,
    marks: [
      { kind: "favorite", t_sec: 805.0 },
      { kind: "comment", t_sec: 812.4 },
    ],
    ...overrides,
  };
}

describe("sessionPathFor", () => {
  it("кладёт отчёт рядом с плейлистом, а не вместо answers.json", () => {
    expect(sessionPathFor(PLAYLIST)).toBe(`${PLAYLIST}.session.json`);
    expect(sessionPathFor(PLAYLIST)).not.toBe(answersPathFor(PLAYLIST));
  });
});

describe("buildSessionReport", () => {
  it("отдаёт ровно контракт §5", () => {
    const report = buildSessionReport(input());
    expect(report).toEqual({
      session_version: SESSION_VERSION,
      playlist: PLAYLIST,
      started_at: "2026-10-21T09:12:03.120Z",
      updated_at: "2026-10-21T09:19:44.010Z",
      entry_index: 1,
      question_id: "q07",
      path: "/Volumes/tempwork/a/P1755051.MOV",
      t_sec: 812.4,
      playing: false,
      reached: [
        { entry_index: 0, t_sec: 34.2 },
        { entry_index: 1, t_sec: 812.4 },
      ],
      answers: 3,
      marks: [
        { kind: "favorite", t_sec: 805.0 },
        { kind: "comment", t_sec: 812.4 },
      ],
    });
  });

  it("не пускает наружу путь, которого нет в плейлисте", () => {
    const report = buildSessionReport(input({
      entries: [{ path: "/idx/only.MOV" }],
      entryIndex: 0,
      questionId: "q00",
      path: "C:\\Windows\\secret.txt",
      reached: [
        { entry_index: 0, t_sec: 1.0 },
        { entry_index: 9, t_sec: 2.0 },
      ],
    }));
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("secret.txt");
    expect(serialized).not.toContain("C:\\");
    expect(report.path).toBeNull();
    expect(report.reached).toEqual([{ entry_index: 0, t_sec: 1.0 }]);
  });

  it("без активной записи (конец/закрытие) не выдумывает path", () => {
    const report = buildSessionReport(input({ entryIndex: -1, questionId: null, path: null, tSec: 0 }));
    expect(report.path).toBeNull();
    expect(report.question_id).toBeNull();
    expect(JSON.stringify(report)).not.toContain("P175505");
  });
});

describe("writeSessionReport", () => {
  it("пишет один раз в <плейлист>.session.json и не трогает answers.json", async () => {
    const writeTextFile = vi.fn(async (_path: string, _contents: string) => undefined);
    const report = buildSessionReport(input());
    const path = await writeSessionReport(report, { writeTextFile });

    expect(path).toBe(sessionPathFor(PLAYLIST));
    expect(writeTextFile).toHaveBeenCalledTimes(1);
    const [calledPath, content] = writeTextFile.mock.calls[0] as unknown as [string, string];
    expect(calledPath).toBe(`${PLAYLIST}.session.json`);
    expect(calledPath).not.toBe(answersPathFor(PLAYLIST));
    expect(JSON.parse(content)).toEqual(report);
  });

  it("перезаписывает тот же файл, а не дописывает второй", async () => {
    const writeTextFile = vi.fn(async (_path: string, _contents: string) => undefined);
    const first = buildSessionReport(input({ tSec: 10 }));
    const second = buildSessionReport(input({ tSec: 20 }));
    await writeSessionReport(first, { writeTextFile });
    await writeSessionReport(second, { writeTextFile });
    const paths = writeTextFile.mock.calls.map((call) => call[0]);
    expect(paths).toEqual([sessionPathFor(PLAYLIST), sessionPathFor(PLAYLIST)]);
    expect(JSON.parse((writeTextFile.mock.calls[1] as unknown as [string, string])[1]).t_sec).toBe(20);
  });
});

describe("anti-cheat: один писатель", () => {
  it("sessionReport.ts не знает про answers.json", () => {
    const source = sessionReportSource;
    expect(source).not.toContain("answersPathFor");
    expect(source).not.toContain(".answers.json");
    expect(source).not.toContain("serializeAnswersFile");
  });
});
