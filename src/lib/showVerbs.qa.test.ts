// tb_1792532465_79489_1 — QA-PREP к tb_1792532431_93509_9 (Alpha).
// Один манифест: uiManifest.verbs по таблице §2 разведки + doc anchors,
// на которые ссылается протокол CUT (просьба Archivist, tb_1792530803_93509_5).
// tb_1792536109_79489_5: шаг 2 — file-queue больше не пуст; тест сверяет
// манифест с реальным списком глаголов Rust-очереди (дрейф виден сразу).
import { describe, expect, it } from "vitest";
import manifestDoc from "../../docs/AGENT_DATA_MANIFEST.md?raw";
import queueSource from "../../src-tauri/src/command_queue.rs?raw";
import { buildUIManifest, isUIManifest } from "./uiManifest";

const API = ["snapshot", "openFile", "addMomentMarker"];

// §2 разведки + шаг 2: глагол → статус / кто умеет / транспорт.
const EXPECTED = [
  { name: "open_playlist", status: "present", by: "both", transport: "file-queue" },
  { name: "open_file", status: "present", by: "both", transport: "file-queue" },
  { name: "seek", status: "present", by: "both", transport: "file-queue" },
  { name: "play_range", status: "present", by: "both", transport: "file-queue" },
  { name: "caption", status: "partial", by: "human", transport: "file" },
  { name: "next", status: "present", by: "both", transport: "file-queue" },
  { name: "pause", status: "present", by: "both", transport: "file-queue" },
  { name: "ask_and_answer", status: "present", by: "both", transport: "file" },
  { name: "show_session", status: "present", by: "agent", transport: "file" },
] as const;

describe("uiManifest verbs", () => {
  it("версия 2 и все глаголы §2 с отметками есть/частично/нет", () => {
    const manifest = buildUIManifest("0.26.0", API);
    expect(manifest.manifest_version).toBe(2);
    expect(manifest.verbs.map((verb) => verb.name)).toEqual(EXPECTED.map((verb) => verb.name));
    for (const expected of EXPECTED) {
      const verb = manifest.verbs.find((entry) => entry.name === expected.name);
      expect(verb).toBeDefined();
      expect(verb!.status).toBe(expected.status);
      expect(verb!.by).toBe(expected.by);
      expect(verb!.transport).toBe(expected.transport);
      expect(verb!.args).toBeTypeOf("string");
      expect(verb!.returns).toBeTypeOf("string");
      expect(verb!.args.length).toBeGreaterThan(0);
    }
  });

  it("file-queue — только глаголы, реализованные в Rust-очереди", () => {
    const manifest = buildUIManifest("0.26.0", API);
    const queueVerbs = manifest.verbs.filter((verb) => verb.transport === "file-queue");
    expect(queueVerbs.length).toBeGreaterThan(0);
    for (const verb of queueVerbs) {
      expect(queueSource, `Rust VERBS не знает ${verb.name}`).toContain(`"${verb.name}"`);
    }
    // И наоборот: каждый глагол Rust объявлен в манифесте агенту.
    for (const match of queueSource.matchAll(/^\s{4}"([a-z_]+)",\s*$/gm)) {
      expect(
        manifest.verbs.some((verb) => verb.name === match[1] && verb.transport === "file-queue"),
        `Rust-глагол ${match[1]} не объявлен в манифесте`,
      ).toBe(true);
    }
  });

  it("у file-глаголов названы артефакты", () => {
    const manifest = buildUIManifest("0.26.0", API);
    for (const verb of manifest.verbs.filter((entry) => entry.transport === "file")) {
      expect(verb.artifacts?.length, `${verb.name}: нет artifacts`).toBeGreaterThan(0);
    }
  });

  it("новые поля не ломают isUIManifest и api-дрейф по-прежнему виден", () => {
    const manifest = buildUIManifest("0.26.0", API);
    expect(isUIManifest(manifest)).toBe(true);
    expect(manifest.api).toEqual(API);
    expect(isUIManifest({ ...manifest, verbs: "nope" })).toBe(false);
  });
});

describe("AGENT_DATA_MANIFEST anchors", () => {
  const doc = manifestDoc;

  it("у §0/§5/§5.2/§5.5/§6.1/§6.2/§7 есть heading id", () => {
    for (const heading of ["## 0.", "## 5.", "## 5.2.", "## 5.5.", "## 6.1.", "## 6.2.", "## 7."]) {
      const line = doc.split("\n").find((entry: string) => entry.startsWith(heading));
      expect(line, `нет заголовка ${heading}`).toBeDefined();
      expect(line, `${heading}: нет <!-- {#id} -->`).toMatch(/\{#[\w.-]+\}/);
    }
  });

  it("есть §5.4 про session.json и он не подменяет answers.json", () => {
    expect(doc).toMatch(/## 5\.4\..*\{#[\w.-]+\}/);
    const section = doc.slice(doc.indexOf("## 5.4."));
    expect(section).toContain(".session.json");
    expect(section).toContain("answers.json");
    expect(section).toMatch(/session_version/);
    expect(section).toMatch(/session\.json[^\n]*не[^\n]*answers\.json|answers\.json[^\n]*не[^\n]*session\.json/);
  });

  it("§5.5 описывает очередь: inbox/ack, cmd/ack_version, allowlist и expires_at", () => {
    const section = doc.slice(doc.indexOf("## 5.5."), doc.indexOf("## 6. Что НЕ входит"));
    expect(section).toContain("inbox/");
    expect(section).toContain("ack/");
    expect(section).toContain("cmd_version");
    expect(section).toContain("ack_version");
    expect(section).toContain("expires_at");
    expect(section).toContain("/Volumes");
    expect(section).toMatch(/идемпотент/i);
    expect(section).not.toContain("POST /control");
  });
});
