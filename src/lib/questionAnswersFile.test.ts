import { beforeEach, describe, expect, it, vi } from "vitest";

// tb_1795498927_72599_1: ответы не писались рядом с плейлистом из /tmp, отказ был
// тихий (находка Phi 24.11). Здесь два контракта: текст громкого отказа и то, что
// санитайз при открытии отдаёт ошибку вызывающему, а не глотает её.
const fsMock = vi.hoisted(() => ({
  readTextFile: vi.fn(async (_p: string): Promise<string> => {
    throw new Error("no such file");
  }),
  writeTextFile: vi.fn(async (_p: string, _t: string): Promise<void> => {}),
  exists: vi.fn(async (_p: string): Promise<boolean> => false),
  mkdir: vi.fn(async (_p: string, _o?: unknown): Promise<void> => {}),
}));
vi.mock("@tauri-apps/plugin-fs", () => fsMock);

import {
  PLAYER_WRITE_ROOTS,
  answersWriteFailureText,
  sanitizeAnswersFileOnDisk,
} from "./questionAnswersFile";

const PLAYLIST = "/private/tmp/phi-e2e2-fix.71vx2_l3/e2e2-context-v3.playlist.json";

beforeEach(() => {
  fsMock.readTextFile.mockReset();
  fsMock.readTextFile.mockImplementation(async () => {
    throw new Error("no such file");
  });
  fsMock.writeTextFile.mockReset();
  fsMock.writeTextFile.mockImplementation(async () => {});
  fsMock.exists.mockReset();
  fsMock.exists.mockImplementation(async () => false);
});

describe("answersWriteFailureText: громкий отказ с путём и выходом", () => {
  it("называет папку и файл, который не удалось записать", () => {
    const text = answersWriteFailureText(PLAYLIST, "answer");
    expect(text).toContain("/private/tmp/phi-e2e2-fix.71vx2_l3");
    expect(text).toContain("e2e2-context-v3.playlist.json.answers.json");
  });

  it("говорит, что ответы лежат только маркерами", () => {
    for (const stage of ["open", "answer", "send"] as const) {
      expect(answersWriteFailureText(PLAYLIST, stage).toLowerCase()).toContain("markers");
    }
  });

  it("называет корни, куда плеер писать может, и что делать", () => {
    const text = answersWriteFailureText(PLAYLIST, "open");
    for (const root of PLAYER_WRITE_ROOTS) expect(text).toContain(root);
    expect(text.toLowerCase()).toContain("copy the playlist");
  });

  it("для отчёта о показе называет session.json, а не answers.json", () => {
    const text = answersWriteFailureText(PLAYLIST, "session");
    expect(text).toContain("e2e2-context-v3.playlist.json.session.json");
    expect(text).not.toContain(".answers.json");
  });

  it("добавляет причину, если она есть", () => {
    const text = answersWriteFailureText(PLAYLIST, "answer", "forbidden path: /private/tmp/x");
    expect(text).toContain("forbidden path: /private/tmp/x");
  });

  it("не падает на пути без папки", () => {
    expect(() => answersWriteFailureText("list.playlist.json", "open")).not.toThrow();
    expect(answersWriteFailureText("list.playlist.json", "open")).toContain("list.playlist.json.answers.json");
  });

  it("причина-объект превращается в короткую строку", () => {
    const err = new Error("forbidden path: /private/tmp/x");
    expect(answersWriteFailureText(PLAYLIST, "open", err)).toContain("forbidden path: /private/tmp/x");
  });
});

describe("sanitizeAnswersFileOnDisk: ошибка записи доходит до вызывающего", () => {
  it("отказ writeTextFile не глотается", async () => {
    fsMock.writeTextFile.mockImplementation(async () => {
      throw new Error("forbidden path: " + PLAYLIST + ".answers.json");
    });
    await expect(
      sanitizeAnswersFileOnDisk(PLAYLIST, { playlistId: "p", questionIds: ["q1"] }),
    ).rejects.toThrow(/forbidden path/);
  });

  it("при удаче пишет стартовый answers.json рядом с плейлистом", async () => {
    const res = await sanitizeAnswersFileOnDisk(PLAYLIST, { playlistId: "p", questionIds: ["q1"] });
    expect(fsMock.writeTextFile).toHaveBeenCalledTimes(1);
    expect(fsMock.writeTextFile.mock.calls[0][0]).toBe(`${PLAYLIST}.answers.json`);
    expect(res.doc.pending_question_ids).toEqual(["q1"]);
  });
});
