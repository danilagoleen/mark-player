// tb_1792536109_79489_5: контракт очереди команд агента (шаг 2 разведки).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import pkg from "../../package.json";
import appSrc from "../App.tsx?raw";
import {
  AgentVerbError,
  QUEUE_ACK_VERSION,
  QUEUE_CMD_VERSION,
  ackErrorFor,
  buildAck,
  cachedAckFor,
  describeAck,
  inlinePlaylistForCommand,
  isAgentCommandExpired,
  isQueueId,
  ackFileName,
  answersAckFileName,
  commandFileName,
  commandIdForPlaylistId,
  openPlaylistVerdict,
  playerVersion,
  readQuestionCommandId,
  rememberQuestionCommandId,
  parseAgentCommand,
  rememberAck,
  serializeAck,
  summarizeOpenedPlaylist,
  type AgentCommand,
} from "./agentQueue";

function cmd(over: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    cmd_version: QUEUE_CMD_VERSION,
    id: "cmd-1",
    verb: "next",
    args: {},
    created_at: "2026-10-21T20:00:00Z",
    ...over,
  };
}

describe("parseAgentCommand", () => {
  it("принимает команду шага 2 и подставляет пустые args", () => {
    const result = parseAgentCommand(cmd());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.cmd.args).toEqual({});
  });

  it("отказывает чужой версии, глаголу вне списка и небезопасному id", () => {
    const version = parseAgentCommand(cmd({ cmd_version: 2 }));
    expect(version.ok).toBe(false);
    if (!version.ok) expect(version.code).toBe("unsupported_version");

    const verb = parseAgentCommand(cmd({ verb: "shell" }));
    expect(verb.ok).toBe(false);
    if (!verb.ok) expect(verb.code).toBe("unknown_verb");

    const id = parseAgentCommand(cmd({ id: "../escape" }));
    expect(id.ok).toBe(false);
    if (!id.ok) expect(id.code).toBe("invalid_id");

    const args = parseAgentCommand(cmd({ args: [1, 2] }));
    expect(args.ok).toBe(false);
    if (!args.ok) expect(args.code).toBe("invalid_args");
  });

  it("отказывает битому expires_at и мусору", () => {
    const bad = parseAgentCommand(cmd({ expires_at: "завтра" }));
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.code).toBe("invalid_expires_at");
    expect(parseAgentCommand(null).ok).toBe(false);
    expect(parseAgentCommand("no").ok).toBe(false);
  });

  it("id — имя файла, слеши и .. запрещены", () => {
    expect(isQueueId("abc-1_x.json")).toBe(true);
    expect(isQueueId("a/b")).toBe(false);
    expect(isQueueId("..")).toBe(false);
    expect(isQueueId("a..b")).toBe(false);
    expect(commandFileName("abc")).toBe("abc.cmd.json");
    expect(ackFileName("abc")).toBe("abc.ack.json");
  });
});

describe("срок жизни", () => {
  const now = Date.parse("2026-10-21T12:00:00Z");
  it("прошлое — истекла, будущее — нет, мусор — истекла (fail loud)", () => {
    expect(isAgentCommandExpired({ expires_at: "2026-10-21T11:59:59Z" }, now)).toBe(true);
    expect(isAgentCommandExpired({ expires_at: "2026-10-21T12:00:01Z" }, now)).toBe(false);
    expect(isAgentCommandExpired({}, now)).toBe(false);
    expect(isAgentCommandExpired({ expires_at: "not a date" }, now)).toBe(true);
  });
});

describe("ack", () => {
  it("несёт версию, id, статус и ошибку; сериализуется в JSON", () => {
    const ack = buildAck({
      id: "cmd-1",
      verb: "seek",
      status: "error",
      at: "2026-10-21T12:00:00Z",
      error: { code: "path_forbidden", message: "вне $HOME" },
    });
    expect(ack.ack_version).toBe(QUEUE_ACK_VERSION);
    expect(JSON.parse(serializeAck(ack))).toEqual({
      ack_version: QUEUE_ACK_VERSION,
      id: "cmd-1",
      verb: "seek",
      status: "error",
      at: "2026-10-21T12:00:00Z",
      player_version: pkg.version,
      error: { code: "path_forbidden", message: "вне $HOME" },
    });
    expect(describeAck(ack)).toContain("path_forbidden");
    expect(describeAck(buildAck({ id: "x", verb: "next", status: "done" }))).toContain("done");
  });
});

// tb_1793543005_43420_1: ack говорит, КАКОЙ плеер ответил. Живой случай 01.11:
// 0.26.4 ответил `done` на плейлист из картинок-вопросов, не показав карточек,
// а у агента не было способа отличить старую сборку от новой.
describe("ack: версия плеера", () => {
  it("player_version — версия из package.json (одна правда с appVersion)", () => {
    expect(playerVersion()).toBe(pkg.version);
  });

  it("несёт версию любой ack: done, error и expired", () => {
    for (const status of ["done", "error", "expired"] as const) {
      const ack = buildAck({ id: "c-1", verb: "next", status });
      expect(ack.player_version).toBe(pkg.version);
      expect(JSON.parse(serializeAck(ack)).player_version).toBe(pkg.version);
    }
  });

  it("result — только когда его передали (другие глаголы без итога)", () => {
    expect(buildAck({ id: "c-1", verb: "seek", status: "done" }).result).toBeUndefined();
    const result = { entries: 2, questions: 2, materialized: 2, warnings: [] };
    expect(buildAck({ id: "c-1", verb: "open_playlist", status: "done", result }).result).toEqual(result);
  });

  it("проводка: App кладёт итог и версию в ack, а не молчит «done»", () => {
    expect(appSrc).toContain("summarizeOpenedPlaylist(");
    expect(appSrc).toContain("openPlaylistVerdict(");
    expect(appSrc).toContain("ackErrorFor(");
  });
});

describe("итог открытия плейлиста (summarizeOpenedPlaylist)", () => {
  const q = (id: string, path: string | null = `/idx/${id}.png`) => ({
    question_id: id,
    ...(path ? { path } : {}),
    question: "Один ли человек?",
  });

  it("считает записи, вопросы и созданные маркеры", () => {
    const r = summarizeOpenedPlaylist([q("a"), q("b"), { path: "/idx/x.mov" }], { materialized: 2 });
    expect(r).toEqual({ entries: 3, questions: 2, materialized: 2, warnings: [] });
  });

  it("предупреждает: вопрос без path", () => {
    const r = summarizeOpenedPlaylist([q("a"), q("c", null)], { materialized: 1 });
    expect(r.questions).toBe(2);
    expect(r.warnings.join("\n")).toMatch(/question c: no path/);
  });

  it("предупреждает: дубль question_id", () => {
    const r = summarizeOpenedPlaylist([q("a"), q("a"), q("b")], { materialized: 2 });
    expect(r.warnings.join("\n")).toMatch(/duplicate question_id a/);
    expect(r.warnings.join("\n")).not.toMatch(/duplicate question_id b/);
  });

  it("предупреждает: файл записи не найден", () => {
    const r = summarizeOpenedPlaylist([q("a")], { materialized: 1, missingPaths: ["/idx/a.png"] });
    expect(r.warnings.join("\n")).toMatch(/path not found: \/idx\/a\.png/);
  });

  it("повторное открытие: новых маркеров нет — это предупреждение, не ошибка", () => {
    const r = summarizeOpenedPlaylist([q("a"), q("b")], { materialized: 0 });
    expect(r.questions).toBe(2);
    expect(r.warnings.join("\n")).toMatch(/already in markers/);
    expect(openPlaylistVerdict(r, true)).toEqual({ ok: true });
  });

  it("мусор вместо записей не падает", () => {
    expect(summarizeOpenedPlaylist(null as unknown as unknown[], { materialized: 0 }).entries).toBe(0);
    expect(summarizeOpenedPlaylist([null, 5, "x"] as unknown[], { materialized: 0 }).questions).toBe(0);
  });
});

describe("открывать нечего — ошибка, а не тихий done (openPlaylistVerdict)", () => {
  const base = { entries: 0, questions: 0, materialized: 0, warnings: [] as string[] };

  it("0 записей — empty_playlist, и для обычного плейлиста тоже", () => {
    for (const isQuestion of [true, false]) {
      const v = openPlaylistVerdict(base, isQuestion);
      expect(v.ok).toBe(false);
      if (!v.ok) {
        expect(v.code).toBe("empty_playlist");
        expect(v.message.length).toBeGreaterThan(10);
      }
    }
  });

  it("вопрос-плейлист без единого question_id — no_questions", () => {
    const v = openPlaylistVerdict({ ...base, entries: 3 }, true);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.code).toBe("no_questions");
  });

  it("обычный плейлист без вопросов открывается", () => {
    expect(openPlaylistVerdict({ ...base, entries: 3 }, false)).toEqual({ ok: true });
  });

  it("вопрос-плейлист с вопросами открывается", () => {
    expect(openPlaylistVerdict({ ...base, entries: 3, questions: 3, materialized: 3 }, true)).toEqual({ ok: true });
  });
});

describe("код ошибки в ack (ackErrorFor)", () => {
  it("AgentVerbError несёт свой код, остальное — execution_failed", () => {
    expect(ackErrorFor(new AgentVerbError("no_questions", "нет вопросов"))).toEqual({
      code: "no_questions",
      message: "нет вопросов",
    });
    expect(ackErrorFor(new Error("boom"))).toEqual({ code: "execution_failed", message: "boom" });
    expect(ackErrorFor("плохо")).toEqual({ code: "execution_failed", message: "плохо" });
  });

  it("describeAck показывает итог открытия человеку, а не голое done", () => {
    const ack = buildAck({
      id: "c-1",
      verb: "open_playlist",
      status: "done",
      result: { entries: 43, questions: 43, materialized: 43, warnings: ["a", "b"] },
    });
    const line = describeAck(ack);
    expect(line).toContain("43 questions");
    expect(line).toContain("43 markers");
    expect(line).toContain("2 warnings");
  });
});

describe("inline-плейлист (создание подборки с in-out)", () => {
  const command: AgentCommand = {
    cmd_version: 1,
    id: "cmd-2",
    verb: "open_playlist",
    args: {
      name: "Спорные заминки",
      task: "tb_test",
      entries: [
        { path: "/tmp/a.mp4", question_id: "q1", question: "Один ли человек?", in_sec: 3, out_sec: 7 },
        { path: "/tmp/b.mp4", name: "B", duration: 10 },
        { nope: true },
      ],
    },
    author: "Beta",
  };

  it("дополняет записи name/duration/addedAt и берёт схему вопроса", () => {
    const doc = inlinePlaylistForCommand(command);
    expect(doc).not.toBeNull();
    expect(doc!.schema).toBe("vetka.cut.question_playlist/1");
    expect(doc!.source.by).toBe("Beta");
    expect(doc!.source.task).toBe("tb_test");
    expect(doc!.entries).toHaveLength(2);
    expect(doc!.entries[0].name).toBe("a.mp4");
    expect(doc!.entries[0].in_sec).toBe(3);
    expect(doc!.entries[0].out_sec).toBe(7);
    expect(doc!.entries[1].name).toBe("B");
    expect(doc!.entries[1].duration).toBe(10);
  });

  it("args.by важнее author — подпись «агент: кто» в маркерах", () => {
    const doc = inlinePlaylistForCommand({ ...command, args: { ...command.args, by: "Phi" } });
    expect(doc!.source.by).toBe("Phi");
  });

  it("без entries — null (плеер ответит ack error, не молчание)", () => {
    const empty: AgentCommand = { ...command, args: { path: "/tmp/x.json" } };
    expect(inlinePlaylistForCommand(empty)).toBeNull();
  });
});

describe("идемпотентность по id (tb_1792542628_5133_1)", () => {
  it("первый emit не пропускается, повтор того же id — пропускается", () => {
    const handled = new Map<string, string>();
    const command: AgentCommand = {
      cmd_version: 1,
      id: "cmd-repeat",
      verb: "next",
      args: {},
    };
    expect(cachedAckFor(handled, command)).toBeNull();

    const ackText = serializeAck(buildAck({ id: command.id, verb: "next", status: "done", at: "2026-10-21T20:00:05Z" }));
    rememberAck(handled, command.id, ackText);

    expect(cachedAckFor(handled, command)).toBe(ackText);
    expect(cachedAckFor(handled, "cmd-repeat")).toBe(ackText);
  });

  it("ack отдаётся байт-в-байт: второй emit перезаписывает тот же текст", () => {
    const handled = new Map<string, string>();
    const first = serializeAck(buildAck({ id: "cmd-same", verb: "open_file", status: "done", at: "2026-10-21T20:00:00Z" }));
    rememberAck(handled, "cmd-same", first);

    const replay = cachedAckFor(handled, "cmd-same");
    expect(replay).toBe(first);
    expect(serializeAck(JSON.parse(replay!))).toBe(first);
  });

  it("другой id не считается обработанным", () => {
    const handled = new Map<string, string>([["cmd-a", "{}"]]);
    expect(cachedAckFor(handled, "cmd-b")).toBeNull();
  });
});

// tb_1792634443_73606_2: сигнал агенту об ответах — отдельный файл в ack/.
describe("answers ack", () => {
  beforeEach(() => {
    const data = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => { data.set(k, v); },
      removeItem: (k: string) => { data.delete(k); },
      clear: () => { data.clear(); },
      key: () => null,
      get length() { return data.size; },
    } as unknown as Storage);
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("имя файла не затирает ack глагола", () => {
    expect(answersAckFileName("commander-promo-v03-1")).toBe("commander-promo-v03-1.answers.json");
    expect(ackFileName("commander-promo-v03-1")).toBe("commander-promo-v03-1.ack.json");
  });

  it("id команды из inline-плейлиста queue_<id>", () => {
    expect(commandIdForPlaylistId("queue_commander-promo-v03-1")).toBe("commander-promo-v03-1");
    expect(commandIdForPlaylistId("manual/list")).toBe("manual-list");
    expect(commandIdForPlaylistId("")).toBe("playlist");
  });

  it("карта путь плейлиста → id команды переживает чтение", () => {
    rememberQuestionCommandId("/idx/queue_x.playlist.json", "x-1");
    expect(readQuestionCommandId("/idx/queue_x.playlist.json")).toBe("x-1");
    expect(readQuestionCommandId("/idx/other.playlist.json")).toBeNull();
  });
});
