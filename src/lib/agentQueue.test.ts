// tb_1792536109_79489_5: контракт очереди команд агента (шаг 2 разведки).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  QUEUE_ACK_VERSION,
  QUEUE_CMD_VERSION,
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
  readQuestionCommandId,
  rememberQuestionCommandId,
  parseAgentCommand,
  rememberAck,
  serializeAck,
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
      error: { code: "path_forbidden", message: "вне $HOME" },
    });
    expect(describeAck(ack)).toContain("path_forbidden");
    expect(describeAck(buildAck({ id: "x", verb: "next", status: "done" }))).toContain("done");
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
