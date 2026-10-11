// tb_1791156678_82609_2: окно-хост модульной страницы (§11).
// Main-окно читает module.json и открывает это окно (openPanelWindow,
// label panel-module-*, route module-host) с query от moduleHostQuery.
// Здесь: iframe страницы модуля + мост postMessage к MCP модуля:
// page.ready → host.hello {out_dir, asset_base, tokens} → mcp.call ⇄ mcp.result.
// Кода окна слоёв в этом файле нет — только рамка и мост.
import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  buildHostHello,
  callModuleTool,
  modulePlayerTokens,
  parseModuleHostQuery,
  type ModuleHostParams,
} from "./lib/moduleHost";
import { isTauriRuntimeSync } from "./lib/nativeWindow";
import "./index.css";

type HostState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; params: ModuleHostParams; pageUrl: string; mcpNote: string | null };

function ModuleHostStandalone() {
  const [state, setState] = useState<HostState>({ status: "loading" });
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    let dead = false;
    async function boot(): Promise<void> {
      const parsed = parseModuleHostQuery(window.location.search);
      if (!parsed.ok) {
        if (!dead) setState({ status: "error", message: parsed.error });
        return;
      }
      if (!isTauriRuntimeSync()) {
        if (!dead) setState({ status: "error", message: "Index Review needs the desktop app." });
        return;
      }
      try {
        const core = await import("@tauri-apps/api/core");
        const pageUrl = core.convertFileSrc(parsed.params.page);
        if (!dead) setState({ status: "ready", params: parsed.params, pageUrl, mcpNote: null });
      } catch {
        if (!dead) setState({ status: "error", message: "Could not resolve the module page." });
      }
    }
    void boot();
    return () => { dead = true; };
  }, []);

  useEffect(() => {
    if (state.status !== "ready") return;
    const onMessage = (event: MessageEvent) => {
      const live = stateRef.current;
      if (live.status !== "ready") return;
      const frame = frameRef.current?.contentWindow;
      if (!frame || event.source !== frame) return;
      const data = event.data as { type?: string; window?: string; id?: string | number; tool?: string; args?: Record<string, unknown> };
      if (!data || typeof data.type !== "string") return;
      if (data.type === live.params.bridge.ready && data.window === live.params.window) {
        const tokens = modulePlayerTokens((name) =>
          typeof document !== "undefined" ? getComputedStyle(document.documentElement).getPropertyValue(name) : "",
        );
        frame.postMessage(
          { ...buildHostHello({ outDir: live.params.outDir, outDirExists: live.params.outDirExists, assetBase: live.params.assetBase, tokens }), type: live.params.bridge.hello },
          "*",
        );
        return;
      }
      if (data.type === live.params.bridge.call && (typeof data.id === "string" || typeof data.id === "number") && typeof data.tool === "string") {
        const callId = data.id;
        const bridgeResult = live.params.bridge.result;
        void callModuleTool(fetch, data.tool, (data.args ?? {}) as Record<string, unknown>, callId).then((r) => {
          if (r.ok) frame.postMessage({ type: bridgeResult, id: callId, ok: true, result: r.result }, "*");
          else {
            frame.postMessage({ type: bridgeResult, id: callId, ok: false, error: r.error }, "*");
            setState((prev) => (prev.status === "ready" ? { ...prev, mcpNote: r.error } : prev));
          }
        });
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [state.status === "ready"]);

  if (state.status === "error") {
    return (
      <div data-testid="module-host-error" style={{ padding: 24, color: "rgba(255,255,255,0.75)", background: "rgb(30,30,30)", height: "100vh", boxSizing: "border-box", fontSize: 13 }}>
        Index Review unavailable: {state.message}
      </div>
    );
  }
  if (state.status === "loading") {
    return (
      <div style={{ padding: 24, color: "rgba(255,255,255,0.6)", background: "rgb(30,30,30)", height: "100vh", boxSizing: "border-box", fontSize: 13 }}>
        Loading module window…
      </div>
    );
  }
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgb(30,30,30)", display: "flex", flexDirection: "column" }}>
      <iframe
        ref={frameRef}
        data-testid="module-frame"
        title={state.params.title}
        src={state.pageUrl}
        style={{ flex: 1, border: "0", background: "#000" }}
        sandbox="allow-scripts allow-same-origin allow-forms allow-downloads"
      />
      {state.mcpNote ? (
        <div data-testid="module-host-mcp-note" style={{ padding: "4px 12px", fontSize: 12, color: "rgba(255,255,255,0.55)", borderTop: "1px solid #333" }}>
          Module bridge: {state.mcpNote}
        </div>
      ) : null}
    </div>
  );
}

const root = document.getElementById("root");
if (root) {
  document.body.style.background = "rgb(30,30,30)";
  createRoot(root).render(
    <StrictMode>
      <ModuleHostStandalone />
    </StrictMode>,
  );
}
