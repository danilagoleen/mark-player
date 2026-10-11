// tb_1791156678_82609_2: Load Module host — плеер только открывает окно
// модуля в своей рамке (ARCH_INDEX_LEVELS §11, ADR-2026-10-06-05).
// Манифест cut-player-mcp/module.json (PR #6), мост postMessage:
// page.ready → host.hello → mcp.call ⇄ mcp.result.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_BRIDGE,
  MODULE_MANIFEST_LS_KEY,
  MODULE_MANIFEST_SCHEMA,
  MODULE_MCP_URL,
  buildHostHello,
  buildJsonRpcEnvelope,
  callModuleTool,
  candidateOutDir,
  checkModuleMcp,
  mediaFsPath,
  moduleHostQuery,
  modulePanelLabel,
  parseMcpCallResult,
  parseModuleHostQuery,
  parseModuleManifest,
  resolveModuleFile,
} from "./moduleHost";

const MANIFEST = JSON.stringify({
  schema: "vetka.cut.module/1",
  id: "cut-player-mcp",
  version: "0.1.0",
  title: "Indexing",
  windows: [
    {
      id: "index-review",
      page: "web/review/index.html",
      icon: "web/review/icon.svg",
      title: "Index review",
      layers: ["people"],
      bridge: { hello: "host.hello", ready: "page.ready", call: "mcp.call", result: "mcp.result" },
    },
  ],
  mcp_tools: ["cut_player_people_review", "cut_player_people_confirm"],
  presets: [{ id: "doc", default: true, title: "Documentary" }],
  requires: {},
});

describe("parseModuleManifest", () => {
  it("принимает манифест Phi (PR #6) как есть", () => {
    const r = parseModuleManifest(MANIFEST);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.manifest.id).toBe("cut-player-mcp");
    expect(r.manifest.windows).toHaveLength(1);
    expect(r.manifest.windows[0].bridge).toEqual(DEFAULT_BRIDGE);
    expect(MODULE_MANIFEST_SCHEMA).toBe("vetka.cut.module/1");
  });

  it("битый JSON и чужая схема — отказ с причиной", () => {
    expect(parseModuleManifest("{nope").ok).toBe(false);
    const wrong = parseModuleManifest(JSON.stringify({ schema: "other/9", id: "x", version: "1", title: "T", windows: [], mcp_tools: [], presets: [] }));
    expect(wrong.ok).toBe(false);
  });

  it("окно без page и presets без единственного default — отказ", () => {
    const noPage = JSON.parse(MANIFEST);
    delete noPage.windows[0].page;
    expect(parseModuleManifest(JSON.stringify(noPage)).ok).toBe(false);
    const twoDefaults = JSON.parse(MANIFEST);
    twoDefaults.presets = [{ id: "a", default: true }, { id: "b", default: true }];
    expect(parseModuleManifest(JSON.stringify(twoDefaults)).ok).toBe(false);
  });

  it("манифест с problems от module_info — отказ (модуль сам признал битость)", () => {
    const bad = JSON.parse(MANIFEST);
    bad.problems = ["window index-review: no file web/review/index.html"];
    const r = parseModuleManifest(JSON.stringify(bad));
    expect(r.ok).toBe(false);
  });

  it("bridge по умолчанию подставляется, layers пустые — ок", () => {
    const doc = JSON.parse(MANIFEST);
    delete doc.windows[0].bridge;
    delete doc.windows[0].layers;
    const r = parseModuleManifest(JSON.stringify(doc));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.manifest.windows[0].bridge).toEqual(DEFAULT_BRIDGE);
    expect(r.manifest.windows[0].layers).toEqual([]);
  });
});

describe("пути модуля", () => {
  it("page/icon резолвятся от каталога манифеста", () => {
    expect(resolveModuleFile("/m/cut_player_mcp", "web/review/index.html")).toBe(
      "/m/cut_player_mcp/web/review/index.html",
    );
  });

  it("label панели — panel-module-<id> (capability panels panel-*)", () => {
    expect(modulePanelLabel("index-review")).toBe("panel-module-index-review");
  });

  it("query хоста везёт window + закодированные пути", () => {
    const q = moduleHostQuery({ manifest: "/m/module.json", window: "index-review", page: "/m/x.html", outDir: "/v/cut_index", outDirExists: true, assetBase: "https://asset.localhost/x/" });
    const p = new URLSearchParams(q);
    expect(p.get("window")).toBe("index-review");
    expect(p.get("manifest")).toBe("/m/module.json");
    expect(p.get("page")).toBe("/m/x.html");
    expect(p.get("outdir")).toBe("/v/cut_index");
    expect(p.get("assetbase")).toBe("https://asset.localhost/x/");
  });

  it("out_dir — <stem>.cut_index рядом с видео", () => {
    expect(candidateOutDir("/footage/P1755268.MOV")).toBe("/footage/P1755268.cut_index");
    expect(candidateOutDir("")).toBeNull();
  });

  it("ключ регистрации манифеста стабилен", () => {
    expect(MODULE_MANIFEST_LS_KEY).toBe("vetka_mark_player_module_manifest_v1");
  });

  it("mediaFsPath: asset-URL → путь, blob/пусто → null", () => {
    expect(mediaFsPath(`https://asset.localhost/${encodeURIComponent("/footage/P1755268.MOV")}`)).toBe("/footage/P1755268.MOV");
    expect(mediaFsPath("/footage/P1755268.MOV")).toBe("/footage/P1755268.MOV");
    expect(mediaFsPath("blob:http://localhost/x")).toBeNull();
    expect(mediaFsPath("")).toBeNull();
  });
});

describe("parseModuleHostQuery", () => {
  it("полный query main-окна разбирается", () => {
    const q = moduleHostQuery({ manifest: "/m/module.json", window: "index-review", page: "/m/x.html", title: "Index review", outDir: "/v/cut_index", outDirExists: true, assetBase: "https://asset.localhost/v/" });
    const r = parseModuleHostQuery(`?${q}`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.params.page).toBe("/m/x.html");
    expect(r.params.outDirExists).toBe(true);
    expect(r.params.bridge).toEqual(DEFAULT_BRIDGE);
  });

  it("пустой query и query без page — отказ", () => {
    expect(parseModuleHostQuery("").ok).toBe(false);
    expect(parseModuleHostQuery("?manifest=/m.json&window=w").ok).toBe(false);
  });
});

describe("дверь MCP индексации", () => {
  it("любой HTTP-ответ — available (сервер жив)", async () => {
    const r = await checkModuleMcp(async () => ({ ok: false, status: 404 }));
    expect(r.status).toBe("available");
    expect(MODULE_MCP_URL).toBe("http://127.0.0.1:5002/mcp");
  });

  it("connection refused — missing, abort — error", async () => {
    const missing = await checkModuleMcp(async () => { throw new Error("connection refused"); });
    expect(missing.status).toBe("missing");
    const aborted = await checkModuleMcp(async () => { throw new DOMException("x", "AbortError"); });
    expect(aborted.status).toBe("error");
  });
});

describe("вызов MCP-инструмента", () => {
  it("конверт — JSON-RPC tools/call", () => {
    expect(buildJsonRpcEnvelope(7, "cut_player_people_review", { out_dir: "/v" })).toEqual({
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: { name: "cut_player_people_review", arguments: { out_dir: "/v" } },
    });
  });

  it("JSON-ответ с result разворачивается", () => {
    const r = parseMcpCallResult(JSON.stringify({ jsonrpc: "2.0", id: 7, result: { content: [{ type: "text", text: "{\"queue\":[]}" }] } }));
    expect(r.ok).toBe(true);
  });

  it("JSON-RPC error и мусор — честный отказ", () => {
    expect(parseMcpCallResult(JSON.stringify({ jsonrpc: "2.0", id: 7, error: { message: "nope" } })).ok).toBe(false);
    expect(parseMcpCallResult("garbage").ok).toBe(false);
  });

  it("SSE-ответ (data: строки) парсится", () => {
    const sse = `event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"ok":true}}\n\n`;
    expect(parseMcpCallResult(sse).ok).toBe(true);
  });

  it("не-2xx и сетевая ошибка — отказ с деталью", async () => {
    const http = await callModuleTool(async () => ({ ok: false, status: 500, text: async () => "boom" }), "t", {});
    expect(http.ok).toBe(false);
    const net = await callModuleTool(async () => { throw new Error("refused"); }, "t", {});
    expect(net.ok).toBe(false);
  });
});

describe("host.hello", () => {
  it("несёт out_dir + asset_base + 7 токенов", () => {
    const hello = buildHostHello({
      outDir: "/v/cut_index",
      outDirExists: true,
      assetBase: "https://asset.localhost/v/",
      tokens: { "--bg": "#000", "--fg": "#fff", "--mute": "#888", "--line": "#222", "--card": "#111", "--font": "sans", "--mono": "mono" },
    });
    expect(hello.type).toBe("host.hello");
    expect(hello.out_dir).toBe("/v/cut_index");
    expect(hello.asset_base).toBe("https://asset.localhost/v/");
    expect(Object.keys(hello.tokens)).toHaveLength(7);
  });
});
