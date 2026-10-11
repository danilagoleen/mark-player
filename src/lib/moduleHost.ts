// tb_1791156678_82609_2: Load Module host — сторона плеера.
// ARCH_INDEX_LEVELS §11, ADR-2026-10-06-05: окно проверки слоёв принадлежит
// модулю (cut-player-mcp/module.json, PR #6), плеер только читает манифест,
// открывает страницу в своей рамке (как Comments/Playlist) и мостит её к
// MCP-инструментам модуля: page.ready → host.hello → mcp.call ⇄ mcp.result.
// Кода окна слоёв, Python, весов и ffmpeg в бандле плеера НЕТ.

export const MODULE_MANIFEST_SCHEMA = "vetka.cut.module/1";

/** MCP-сервер модуля: streamable HTTP, stateless (requires.mcp_server в манифесте). */
export const MODULE_MCP_URL = "http://127.0.0.1:5002/mcp";

/** Регистрация манифеста между запусками (только путь к module.json). */
export const MODULE_MANIFEST_LS_KEY = "vetka_mark_player_module_manifest_v1";

export interface ModuleBridgeNames {
  hello: string;
  ready: string;
  call: string;
  result: string;
}

export const DEFAULT_BRIDGE: ModuleBridgeNames = {
  hello: "host.hello",
  ready: "page.ready",
  call: "mcp.call",
  result: "mcp.result",
};

export interface ModulePreset {
  id: string;
  default?: boolean;
  title?: string;
}

export interface ModuleWindowDef {
  id: string;
  page: string;
  icon: string;
  title: string;
  layers: string[];
  bridge: ModuleBridgeNames;
  /** Абсолютные пути — дописывает хост (как module_info у модуля). */
  pagePath?: string;
  iconPath?: string;
}

export interface ModuleManifest {
  schema: string;
  id: string;
  version: string;
  title: string;
  root?: string;
  manifest?: string;
  windows: ModuleWindowDef[];
  mcp_tools: string[];
  presets: ModulePreset[];
  requires?: unknown;
}

export type ManifestParseResult =
  | { ok: true; manifest: ModuleManifest }
  | { ok: false; error: string };

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

function parseBridge(raw: unknown): ModuleBridgeNames | null {
  if (raw === undefined) return { ...DEFAULT_BRIDGE };
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const out = { ...DEFAULT_BRIDGE };
  for (const k of ["hello", "ready", "call", "result"] as const) {
    if (r[k] === undefined) continue;
    if (!isNonEmptyString(r[k])) return null;
    out[k] = r[k];
  }
  return out;
}

/** Валидация манифеста (зеркало check_manifest в cut_player_mcp/module.py). */
export function parseModuleManifest(text: string): ManifestParseResult {
  let doc: Record<string, unknown>;
  try {
    doc = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { ok: false, error: "not JSON" };
  }
  if (doc["schema"] !== MODULE_MANIFEST_SCHEMA) {
    return { ok: false, error: `schema must be ${MODULE_MANIFEST_SCHEMA}` };
  }
  for (const k of ["id", "version", "title"]) {
    if (!isNonEmptyString(doc[k])) return { ok: false, error: `missing: ${k}` };
  }
  const problems = doc["problems"];
  if (Array.isArray(problems) && problems.length > 0) {
    return { ok: false, error: `module reports problems: ${String(problems[0])}` };
  }
  const windows = doc["windows"];
  if (!Array.isArray(windows) || windows.length === 0) {
    return { ok: false, error: "missing: windows" };
  }
  const parsedWindows: ModuleWindowDef[] = [];
  for (const w of windows) {
    if (typeof w !== "object" || w === null) return { ok: false, error: "window: not an object" };
    const ww = w as Record<string, unknown>;
    for (const k of ["id", "page", "icon", "title"]) {
      if (!isNonEmptyString(ww[k])) return { ok: false, error: `window ${String(ww["id"] ?? "?")}: missing ${k}` };
    }
    const bridge = parseBridge(ww["bridge"]);
    if (!bridge) return { ok: false, error: `window ${ww["id"] as string}: bad bridge` };
    const layers = ww["layers"];
    parsedWindows.push({
      id: ww["id"] as string,
      page: ww["page"] as string,
      icon: ww["icon"] as string,
      title: ww["title"] as string,
      layers: Array.isArray(layers) ? layers.filter((l): l is string => typeof l === "string") : [],
      bridge,
    });
  }
  const tools = doc["mcp_tools"];
  if (!Array.isArray(tools) || tools.length === 0 || !tools.every((t) => typeof t === "string")) {
    return { ok: false, error: "missing: mcp_tools" };
  }
  const presets = doc["presets"];
  if (!Array.isArray(presets) || presets.filter((p) => typeof p === "object" && p !== null && (p as { default?: unknown }).default === true).length !== 1) {
    return { ok: false, error: "presets: exactly one default" };
  }
  return {
    ok: true,
    manifest: {
      schema: doc["schema"] as string,
      id: doc["id"] as string,
      version: doc["version"] as string,
      title: doc["title"] as string,
      root: typeof doc["root"] === "string" ? (doc["root"] as string) : undefined,
      manifest: typeof doc["manifest"] === "string" ? (doc["manifest"] as string) : undefined,
      windows: parsedWindows,
      mcp_tools: tools as string[],
      presets: presets as ModulePreset[],
      requires: doc["requires"],
    },
  };
}

/** Каталог манифеста: всё (page/icon) — пути относительно него. */
export function manifestDirOf(manifestPath: string): string {
  const i = Math.max(manifestPath.lastIndexOf("/"), manifestPath.lastIndexOf("\\"));
  return i < 0 ? "." : manifestPath.slice(0, i) || "/";
}

export function resolveModuleFile(manifestDir: string, rel: string): string {
  const base = manifestDir.replace(/[/\\]+$/, "");
  const parts: string[] = [];
  for (const seg of `${base}/${rel}`.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return (base.startsWith("/") ? "/" : "") + parts.join("/");
}

/** Label окна панели (capability panels: panel-*). */
export function modulePanelLabel(windowId: string): string {
  return `panel-module-${windowId}`;
}

export interface ModuleHostQueryOpts {
  manifest: string;
  window: string;
  page: string;
  title?: string;
  outDir: string | null;
  outDirExists: boolean;
  assetBase: string | null;
  bridge?: ModuleBridgeNames;
}

/** Query окна module-host: всё, что ему нужно, без fs-прав (читает main). */
export function moduleHostQuery(o: ModuleHostQueryOpts): string {
  const bridge = o.bridge ?? DEFAULT_BRIDGE;
  const p = new URLSearchParams();
  p.set("manifest", o.manifest);
  p.set("window", o.window);
  p.set("page", o.page);
  p.set("title", o.title?.trim() || o.window);
  p.set("outdir", o.outDir ?? "");
  p.set("outdirexists", o.outDirExists ? "1" : "0");
  p.set("assetbase", o.assetBase ?? "");
  p.set("hello", bridge.hello);
  p.set("ready", bridge.ready);
  p.set("call", bridge.call);
  p.set("result", bridge.result);
  return p.toString();
}

/** out_dir для host.hello: <stem>.cut_index рядом с видео (конвенция §9). */
export function candidateOutDir(mediaPath: string): string | null {  if (!mediaPath) return null;
  const slash = Math.max(mediaPath.lastIndexOf("/"), mediaPath.lastIndexOf("\\"));
  const dir = slash < 0 ? "" : mediaPath.slice(0, slash);
  const base = slash < 0 ? mediaPath : mediaPath.slice(slash + 1);
  const dot = base.lastIndexOf(".");
  const stem = dot <= 0 ? base : base.slice(0, dot);
  if (!stem) return null;
  return `${dir ? `${dir}/` : ""}${stem}.cut_index`;
}

/** src плеера — asset-URL (toAssetUrl); хосту нужен путь для out_dir. */
export function mediaFsPath(mediaKey: string | null | undefined): string | null {
  if (!mediaKey || mediaKey.startsWith("blob:")) return null;
  const scheme = mediaKey.indexOf("://");
  if (scheme < 0) return mediaKey;
  try {
    const afterHost = mediaKey.slice(scheme + 3).split(/[?#]/)[0] ?? "";
    const slash = afterHost.indexOf("/");
    const decoded = decodeURIComponent(slash < 0 ? "" : afterHost.slice(slash + 1));
    return decoded || null;
  } catch {
    return null;
  }
}

export type ModuleMcpStatus = "available" | "missing" | "error";

export interface ModuleMcpDoor {
  url: string;
  status: ModuleMcpStatus;
  detail: string | null;
}

type FetchLike = (
  url: string,
  init?: Record<string, unknown>,
) => Promise<{ ok: boolean; status: number; text?: () => Promise<string> }>;

/** Дверь MCP индексации — та же честная тройка, что ModuleDoor, но свой id не трогаем. */
export async function checkModuleMcp(fetchImpl: FetchLike = fetch as unknown as FetchLike): Promise<ModuleMcpDoor> {
  try {
    const response = await fetchImpl(MODULE_MCP_URL, { method: "GET" });
    return { url: MODULE_MCP_URL, status: "available", detail: `http ${response.status}` };
  } catch (error) {
    const name = error instanceof DOMException ? error.name : "";
    if (name === "AbortError" || name === "TimeoutError") {
      return { url: MODULE_MCP_URL, status: "error", detail: `request ${name === "AbortError" ? "aborted" : "timed out"}` };
    }
    return { url: MODULE_MCP_URL, status: "missing", detail: error instanceof Error ? error.message : "connection refused" };
  }
}

export function buildJsonRpcEnvelope(id: string | number, tool: string, args: Record<string, unknown>): Record<string, unknown> {
  return { jsonrpc: "2.0", id, method: "tools/call", params: { name: tool, arguments: args } };
}

export type McpCallResult = { ok: true; result: unknown } | { ok: false; error: string };

function unwrapJsonRpc(doc: unknown): McpCallResult | null {
  if (typeof doc !== "object" || doc === null) return null;
  const d = doc as Record<string, unknown>;
  if ("error" in d) {
    const e = d["error"] as { message?: unknown };
    return { ok: false, error: typeof e?.message === "string" ? e.message : "mcp error" };
  }
  if ("result" in d) return { ok: true, result: d["result"] };
  return null;
}

/** Ответ FastMCP: stateless JSON либо SSE (data: строки) — честно оба. */
export function parseMcpCallResult(bodyText: string): McpCallResult {
  const text = bodyText.trim();
  if (!text) return { ok: false, error: "empty mcp response" };
  if (text.startsWith("{") || text.startsWith("[")) {
    try {
      const doc: unknown = JSON.parse(text);
      return unwrapJsonRpc(doc) ?? { ok: false, error: "not a JSON-RPC response" };
    } catch {
      return { ok: false, error: "unparseable mcp response" };
    }
  }
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("data:")) continue;
    try {
      const r = unwrapJsonRpc(JSON.parse(t.slice(5).trim()) as unknown);
      if (r) return r;
    } catch {
      continue;
    }
  }
  return { ok: false, error: "unparseable mcp response" };
}

export async function callModuleTool(
  fetchImpl: FetchLike,
  tool: string,
  args: Record<string, unknown>,
  id: string | number = 1,
): Promise<McpCallResult> {
  let response: { ok: boolean; status: number; text?: () => Promise<string> };
  try {
    response = await fetchImpl(MODULE_MCP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify(buildJsonRpcEnvelope(id, tool, args)),
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "connection refused" };
  }
  if (!response.ok) return { ok: false, error: `mcp http ${response.status}` };
  try {
    const body = response.text ? await response.text() : "";
    return parseMcpCallResult(body);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "unreadable mcp response" };
  }
}

export interface HostHelloOpts {
  outDir: string | null;
  outDirExists: boolean;
  assetBase: string | null;
  tokens: Record<string, string>;
}

export interface HostHelloMessage {
  type: "host.hello";
  out_dir: string | null;
  out_dir_exists: boolean;
  asset_base: string | null;
  tokens: Record<string, string>;
}

/** host → page. asset_base: хост отдаёт <out_dir> (миниатюры); tokens: 7 CSS-варов плеера. */
export function buildHostHello(o: HostHelloOpts): HostHelloMessage {
  return {
    type: "host.hello",
    out_dir: o.outDir,
    out_dir_exists: o.outDirExists,
    asset_base: o.assetBase,
    tokens: { ...o.tokens },
  };
}

/** Имена 7 токенов стиля (§11, module.py): только --bg --fg --mute --line --card --font --mono. */
export const PLAYER_TOKEN_NAMES = ["--bg", "--fg", "--mute", "--line", "--card", "--font", "--mono"] as const;

export function modulePlayerTokens(getVar: (name: string) => string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of PLAYER_TOKEN_NAMES) out[name] = (getVar(name) ?? "").trim();
  return out;
}

export interface ModuleHostParams {
  manifest: string;
  window: string;
  page: string;
  title: string;
  outDir: string | null;
  outDirExists: boolean;
  assetBase: string | null;
  bridge: ModuleBridgeNames;
}

export type ModuleHostQueryResult =
  | { ok: true; params: ModuleHostParams }
  | { ok: false; error: string };

/** Query окна module-host (кладёт main через openPanelWindow). */
export function parseModuleHostQuery(search: string): ModuleHostQueryResult {
  let p: URLSearchParams;
  try {
    p = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  } catch {
    return { ok: false, error: "bad query" };
  }
  const manifest = (p.get("manifest") ?? "").trim();
  const windowId = (p.get("window") ?? "").trim();
  const page = (p.get("page") ?? "").trim();
  if (!manifest || !windowId || !page) {
    return { ok: false, error: "module host needs manifest, window and page" };
  }
  const bridge: ModuleBridgeNames = { ...DEFAULT_BRIDGE };
  for (const k of ["hello", "ready", "call", "result"] as const) {
    const v = (p.get(k) ?? "").trim();
    if (v) bridge[k] = v;
  }
  const outDir = (p.get("outdir") ?? "").trim();
  const assetBase = (p.get("assetbase") ?? "").trim();
  return {
    ok: true,
    params: {
      manifest,
      window: windowId,
      page,
      title: (p.get("title") ?? "").trim() || windowId,
      outDir: outDir || null,
      outDirExists: p.get("outdirexists") === "1",
      assetBase: assetBase || null,
      bridge,
    },
  };
}
