import { LAB_MIN_SHELL_HEIGHT, LAB_MIN_SHELL_WIDTH } from "./geometry";

export function isTauriRuntimeSync() {
  try {
    return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  } catch {
    return false;
  }
}

export interface PlayerNativeWindowTrace {
  scale_factor: number;
  inner_physical_width: number;
  inner_physical_height: number;
  outer_physical_width: number;
  outer_physical_height: number;
  inner_logical_width: number;
  inner_logical_height: number;
  outer_logical_width: number;
  outer_logical_height: number;
}

export async function isTauriRuntime() {
  try {
    return isTauriRuntimeSync();
  } catch {
    return false;
  }
}

async function getInvoke() {
  if (!(await isTauriRuntime())) return null;
  const core = await import("@tauri-apps/api/core");
  return core.invoke;
}

export async function setCurrentWindowLogicalSize(width: number, height: number): Promise<boolean> {
  if (!(await isTauriRuntime())) return false;
  try {
    const [{ getCurrentWindow }, { LogicalSize }] = await Promise.all([
      import("@tauri-apps/api/window"),
      import("@tauri-apps/api/dpi"),
    ]);
    const win = getCurrentWindow();
    // 0.10.21: флор = нативный минимум tauri.conf (720×560), иначе CSS-shell
    // и окно разъезжаются и тулбар умирает в зауженном shell.
    await win.setSize(new LogicalSize(Math.max(LAB_MIN_SHELL_WIDTH, Math.round(width)), Math.max(LAB_MIN_SHELL_HEIGHT, Math.round(height))));
    return true;
  } catch (error) {
    console.warn("[Mark Player] setCurrentWindowLogicalSize failed:", error);
    return false;
  }
}

export async function configurePlayerWindow(
  width: number,
  height: number,
  aspectWidth: number,
  aspectHeight: number,
): Promise<boolean> {
  // 0.10.21: тот же нативный флор, что в setCurrentWindowLogicalSize.
  const safeWidth = Math.max(LAB_MIN_SHELL_WIDTH, Math.round(width));
  const safeHeight = Math.max(LAB_MIN_SHELL_HEIGHT, Math.round(height));
  if (!(await isTauriRuntime())) return false;

  try {
    const invoke = await getInvoke();
    if (invoke) {
      await invoke("configure_player_window", {
        width: safeWidth,
        height: safeHeight,
        aspectWidth: Math.max(1, Math.round(aspectWidth || 1)),
        aspectHeight: Math.max(1, Math.round(aspectHeight || 1)),
      });
      return true;
    }
  } catch (error) {
    console.warn("[Mark Player] configure_player_window failed:", error);
  }

  return setCurrentWindowLogicalSize(safeWidth, safeHeight);
}

export async function tracePlayerWindow(): Promise<PlayerNativeWindowTrace | null> {
  if (!(await isTauriRuntime())) return null;
  try {
    const invoke = await getInvoke();
    if (!invoke) return null;
    return await invoke<PlayerNativeWindowTrace>("trace_player_window");
  } catch (error) {
    console.warn("[Mark Player] trace_player_window failed:", error);
    return null;
  }
}

export async function toggleFullscreen(): Promise<boolean | null> {
  if (await isTauriRuntime()) {
    try {
      const invoke = await getInvoke();
      if (invoke) {
        return await invoke<boolean>("toggle_player_fullscreen");
      }
    } catch (error) {
      console.warn("[Mark Player] native fullscreen command failed:", error);
    }

    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      const current = await win.isFullscreen();
      await win.setFullscreen(!current);
      return !current;
    } catch (error) {
      console.warn("[Mark Player] native fullscreen api failed:", error);
    }
  }

  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return false;
    }
    await document.documentElement.requestFullscreen();
    return true;
  } catch (error) {
    console.warn("[Mark Player] DOM fullscreen failed:", error);
    return null;
  }
}

export async function toAssetUrl(filePath: string): Promise<string | null> {
  if (!(await isTauriRuntime())) return null;
  const core = await import("@tauri-apps/api/core");
  return core.convertFileSrc(filePath);
}

export interface DialogFilter {
  name: string;
  extensions: string[];
}

export interface OpenDialogOptions {
  multiple?: boolean;
  filters?: DialogFilter[];
}

export interface SaveDialogOptions {
  defaultPath?: string;
  filters?: DialogFilter[];
}

import { NATIVE_IMAGE_EXT, NATIVE_VIDEO_EXT } from "./mediaPlayability";

// Open-gate 1.1: Finder серит всё, что <video>/<img> не переварят.
// Источник — mediaPlayability (единый с гейтом). All Files оставлен как
// люк: выбрав mkv вручную, пользователь получит объяснение от гейта,
// а не молчаливый чёрный экран.
const DEFAULT_MEDIA_FILTERS: DialogFilter[] = [
  { name: "Video", extensions: [...NATIVE_VIDEO_EXT] },
  { name: "Images", extensions: [...NATIVE_IMAGE_EXT] },
  { name: "All Files", extensions: ["*"] },
];

export async function openFileDialog(options?: OpenDialogOptions): Promise<string | null> {
  if (!(await isTauriRuntime())) return null;
  try {
    const dialog = await import("@tauri-apps/plugin-dialog");
    const path = await dialog.open({
      multiple: false,
      filters: options?.filters ?? DEFAULT_MEDIA_FILTERS,
    });
    return path as string | null;
  } catch (error) {
    console.warn("[Mark Player] openFileDialog failed:", error);
    return null;
  }
}

export async function openFilesDialog(options?: OpenDialogOptions): Promise<string[] | null> {
  if (!(await isTauriRuntime())) return null;
  try {
    const dialog = await import("@tauri-apps/plugin-dialog");
    const paths = await dialog.open({
      multiple: true,
      filters: options?.filters ?? DEFAULT_MEDIA_FILTERS,
    });
    if (!paths) return null;
    return (Array.isArray(paths) ? paths : [paths]) as string[];
  } catch (error) {
    console.warn("[Mark Player] openFilesDialog failed:", error);
    return null;
  }
}

export type SaveResult =
  | { status: "saved"; path: string }
  | { status: "cancelled" }
  | { status: "failed"; error: string };

export async function saveFileDialog(
  content: string,
  defaultName: string,
  options?: SaveDialogOptions,
): Promise<boolean> {
  const result = await saveFileDialogResult(content, defaultName, options);
  return result.status === "saved";
}

// Bell №5: verbose variant — distinguishes user cancel (silent)
// from real failure (loud toast). New code prefers this;
// saveFileDialog stays as a boolean thin wrapper.
export async function saveFileDialogResult(
  content: string,
  defaultName: string,
  options?: SaveDialogOptions,
): Promise<SaveResult> {
  if (!(await isTauriRuntime())) return { status: "failed", error: "not a Tauri runtime" };
  try {
    const dialog = await import("@tauri-apps/plugin-dialog");
    const path = await dialog.save({
      defaultPath: options?.defaultPath ?? defaultName,
      filters: options?.filters ?? [{ name: "All Files", extensions: ["*"] }],
    });
    if (!path) return { status: "cancelled" };
    const fs = await import("@tauri-apps/plugin-fs");
    await fs.writeTextFile(path, content);
    return { status: "saved", path };
  } catch (error) {
    console.warn("[Mark Player] saveFileDialog failed:", error);
    return { status: "failed", error: error instanceof Error ? error.message : String(error) };
  }
}

export interface ProbeResult {
  ok: boolean;
  path: string;
  exists: boolean;
  container: string;
  duration_sec: number;
  bitrate_kbps: number;
  file_size_bytes: number;
  video_codec: string;
  audio_codec: string;
  width: number;
  height: number;
  fps: number;
  pix_fmt: string;
  color_space: string;
  bit_depth: number;
  codec_family: string;
  playback_class: string;
  error: string;
}

const DEFAULT_API_BASE = "/api";

// 0.10.23: dead-probe warning for XML export. Export logic itself is untouched
// (fps 25 assumed, audio track omitted when probe is silent) — but the user
// must see the degradation instead of discovering a missing audio track later.
export const PROBE_EXPORT_WARNING =
  "probe unavailable: fps assumed 25, audio track omitted";

export function probeExportWarning(probe: ProbeResult | null | undefined): string | null {
  if (probe?.ok) return null;
  return PROBE_EXPORT_WARNING;
}

// Шаг 4/7: оранжевый probe-offline виден ТОЛЬКО при attached media.
// Было: гейт на fileName — synthetic probe (setSrc("") + setFileName(...))
// зажигал бейдж при пустом <video>. Правда — src, он кормит <video>.
export function shouldShowProbeOffline(
  src: string | null | undefined,
  probe: ProbeResult | null | undefined,
): boolean {
  if (!src || !src.trim()) return false;
  return !probe?.ok;
}

export async function probeFile(filePath: string, apiBase?: string): Promise<ProbeResult | null> {
  try {
    const base = apiBase ?? DEFAULT_API_BASE;
    const resp = await fetch(`${base}/player/probe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: filePath }),
    });
    if (!resp.ok) return null;
    return await resp.json() as ProbeResult;
  } catch {
    return null;
  }
}

export async function openPanelWindow(label: string, route: string, title: string, width: number, height: number, query?: string): Promise<boolean> {
  if (!isTauriRuntimeSync()) return false;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const baseUrl = window.location.origin;
    await invoke("open_panel_window", { label, route, title, width, height, baseUrl, query: query ?? null });
    return true;
  } catch (error) {
    console.warn("[Mark Player] open_panel_window failed:", error);
    return false;
  }
}
