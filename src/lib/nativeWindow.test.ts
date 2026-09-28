import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";

function mockTauriInternals() {
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
}

function clearTauriInternals() {
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
}

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
  save: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  writeTextFile: vi.fn(),
  writeFile: vi.fn(),
}));

describe("probeFile", () => {
  const mockProbeResponse = {
    ok: true,
    path: "/path/to/video.mp4",
    exists: true,
    container: "mov,mp4,m4a,3gp,3g2,mj2",
    duration_sec: 10.5,
    bitrate_kbps: 5000,
    file_size_bytes: 6553600,
    video_codec: "h264",
    audio_codec: "aac",
    width: 1920,
    height: 1080,
    fps: 25,
    pix_fmt: "yuv420p",
    color_space: "Rec.709",
    bit_depth: 8,
    codec_family: "delivery",
    playback_class: "native",
    error: "",
  };

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns probe result for existing file", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockProbeResponse),
    } as Response);

    const { probeFile } = await import("./nativeWindow");
    const result = await probeFile("/path/to/video.mp4");
    expect(result).toEqual(mockProbeResponse);
    expect(fetch).toHaveBeenCalledWith("/api/player/probe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "/path/to/video.mp4" }),
    });
  });

  it("returns null when server responds with error", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false } as Response);

    const { probeFile } = await import("./nativeWindow");
    const result = await probeFile("/path/to/video.mp4");
    expect(result).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("Network error"));

    const { probeFile } = await import("./nativeWindow");
    const result = await probeFile("/path/to/video.mp4");
    expect(result).toBeNull();
  });

  it("uses custom api base when provided", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockProbeResponse),
    } as Response);

    const { probeFile } = await import("./nativeWindow");
    await probeFile("/path/to/video.mp4", "http://localhost:8080/api");
    expect(fetch).toHaveBeenCalledWith("http://localhost:8080/api/player/probe", expect.any(Object));
  });
});

describe("probeExportWarning", () => {
  const okProbe = {
    ok: true,
    path: "/v.mp4",
    exists: true,
    container: "mp4",
    duration_sec: 10,
    bitrate_kbps: 1000,
    file_size_bytes: 100,
    video_codec: "h264",
    audio_codec: "aac",
    width: 1920,
    height: 1080,
    fps: 25,
    pix_fmt: "yuv420p",
    color_space: "Rec.709",
    bit_depth: 8,
    codec_family: "delivery",
    playback_class: "native",
    error: "",
  };

  it("stays silent when probe is alive", async () => {
    const { probeExportWarning } = await import("./nativeWindow");
    expect(probeExportWarning(okProbe)).toBeNull();
  });

  it("warns when probe returned null (backend down)", async () => {
    const { probeExportWarning, PROBE_EXPORT_WARNING } = await import("./nativeWindow");
    expect(probeExportWarning(null)).toBe(PROBE_EXPORT_WARNING);
  });

  it("warns when probe answered ok:false", async () => {
    const { probeExportWarning } = await import("./nativeWindow");
    expect(probeExportWarning({ ...okProbe, ok: false })).toContain("audio track omitted");
  });
});

describe("shouldShowProbeOffline (Шаг 4/7: бейдж только при attached media)", () => {
  it("src пуст (synthetic probe) + мёртвый probe → бейджа НЕТ [signal: бейдж probe] [project: cut-player]", async () => {
    const { shouldShowProbeOffline } = await import("./nativeWindow");
    expect(shouldShowProbeOffline("", null)).toBe(false);
  });

  it("src непуст + мёртвый probe → бейдж ЕСТЬ", async () => {
    const { shouldShowProbeOffline } = await import("./nativeWindow");
    expect(shouldShowProbeOffline("video.mp4", null)).toBe(true);
  });

  it("src непуст + живой probe → бейджа нет (зелёный показывает ok-ветка)", async () => {
    const { shouldShowProbeOffline } = await import("./nativeWindow");
    expect(
      shouldShowProbeOffline("video.mp4", {
        ok: true, path: "/v.mp4", exists: true, container: "mp4",
        duration_sec: 10, bitrate_kbps: 1000, file_size_bytes: 100,
        video_codec: "h264", audio_codec: "aac", width: 1920, height: 1080,
        fps: 25, pix_fmt: "yuv420p", color_space: "Rec.709", bit_depth: 8,
        codec_family: "delivery", playback_class: "native", error: "",
      }),
    ).toBe(false);
  });

  it("src из пробелов считается пустым", async () => {
    const { shouldShowProbeOffline } = await import("./nativeWindow");
    expect(shouldShowProbeOffline("   ", null)).toBe(false);
  });
});

describe("openFileDialog", () => {
  beforeEach(() => {
    vi.resetModules();
    clearTauriInternals();
  });

  it("returns null when not in Tauri runtime", async () => {
    const { openFileDialog } = await import("./nativeWindow");
    const result = await openFileDialog();
    expect(result).toBeNull();
  });

  it("calls dialog.open and returns path in Tauri runtime", async () => {
    mockTauriInternals();
    const dialog = await import("@tauri-apps/plugin-dialog");
    vi.mocked(dialog.open).mockResolvedValue("/path/to/video.mp4");

    const { openFileDialog } = await import("./nativeWindow");
    const result = await openFileDialog();
    expect(result).toBe("/path/to/video.mp4");
    expect(dialog.open).toHaveBeenCalledWith({
      multiple: false,
      filters: [
        { name: "Video", extensions: ["mp4", "m4v", "mov", "webm", "ogv", "ogg", "m3u8"] },
        { name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp", "tif", "tiff", "avif", "heic", "heif", "svg"] },
        { name: "All Files", extensions: ["*"] },
      ],
    });
  });

  it("dialog filters exclude proxy containers (Finder honesty, open-gate 1.1) [signal: finder-фильтры] [project: cut-player]", async () => {
    mockTauriInternals();
    const dialog = await import("@tauri-apps/plugin-dialog");
    vi.mocked(dialog.open).mockResolvedValue(null);

    const { openFileDialog, openFilesDialog } = await import("./nativeWindow");
    await openFileDialog();
    await openFilesDialog();
    for (const call of vi.mocked(dialog.open).mock.calls) {
      const filters = (call[0] as { filters: { extensions: string[] }[] }).filters;
      const allExts = filters.flatMap((f) => f.extensions);
      for (const banned of ["mkv", "avi", "ts", "wmv", "flv", "mpg"]) {
        expect(allExts, banned).not.toContain(banned);
      }
    }
  });

  it("accepts custom filters", async () => {
    mockTauriInternals();
    const dialog = await import("@tauri-apps/plugin-dialog");
    vi.mocked(dialog.open).mockResolvedValue("/path/to/file.srt");

    const { openFileDialog } = await import("./nativeWindow");
    const result = await openFileDialog({
      filters: [{ name: "SubRip", extensions: ["srt"] }],
    });
    expect(result).toBe("/path/to/file.srt");
    expect(dialog.open).toHaveBeenCalledWith({
      multiple: false,
      filters: [{ name: "SubRip", extensions: ["srt"] }],
    });
  });

  it("returns null when dialog is cancelled", async () => {
    mockTauriInternals();
    const dialog = await import("@tauri-apps/plugin-dialog");
    vi.mocked(dialog.open).mockResolvedValue(null);

    const { openFileDialog } = await import("./nativeWindow");
    const result = await openFileDialog();
    expect(result).toBeNull();
  });
});

describe("toAssetUrl", () => {
  beforeEach(() => {
    vi.resetModules();
    clearTauriInternals();
  });

  it("returns null when not in Tauri runtime", async () => {
    const { toAssetUrl } = await import("./nativeWindow");
    const result = await toAssetUrl("/path/to/video.mp4");
    expect(result).toBeNull();
  });

  it("returns asset protocol URL in Tauri runtime", async () => {
    vi.mock("@tauri-apps/api/core", () => ({
      convertFileSrc: (p: string) => `http://asset.localhost/${encodeURIComponent(p)}`,
    }));
    mockTauriInternals();

    const { toAssetUrl } = await import("./nativeWindow");
    const result = await toAssetUrl("/path/to/video.mp4");
    expect(result).toMatch(/^http:\/\/asset\.localhost\//);
  });
});

describe("saveFileDialog", () => {
  beforeEach(() => {
    vi.resetModules();
    clearTauriInternals();
  });

  it("returns false when not in Tauri runtime", async () => {
    const { saveFileDialog } = await import("./nativeWindow");
    const result = await saveFileDialog("content", "test.srt");
    expect(result).toBe(false);
  });

  it("calls dialog.save and writes file in Tauri runtime", async () => {
    mockTauriInternals();
    const dialog = await import("@tauri-apps/plugin-dialog");
    const fs = await import("@tauri-apps/plugin-fs");
    vi.mocked(dialog.save).mockResolvedValue("/save/path/file.srt");

    const { saveFileDialog } = await import("./nativeWindow");
    const result = await saveFileDialog("SRT content", "markers.srt");
    expect(result).toBe(true);
    expect(dialog.save).toHaveBeenCalledWith({
      defaultPath: "markers.srt",
      filters: [{ name: "All Files", extensions: ["*"] }],
    });
    expect(fs.writeTextFile).toHaveBeenCalledWith("/save/path/file.srt", "SRT content");
  });

  it("returns false when save dialog is cancelled", async () => {
    mockTauriInternals();
    const dialog = await import("@tauri-apps/plugin-dialog");
    vi.mocked(dialog.save).mockResolvedValue(null);

    const { saveFileDialog } = await import("./nativeWindow");
    const result = await saveFileDialog("content", "test.srt");
    expect(result).toBe(false);
  });

  it("accepts custom filters and default path", async () => {
    mockTauriInternals();
    const dialog = await import("@tauri-apps/plugin-dialog");
    vi.mocked(dialog.save).mockResolvedValue("/save/data.json");

    const { saveFileDialog } = await import("./nativeWindow");
    await saveFileDialog('{"key": "value"}', "data.json", {
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    expect(dialog.save).toHaveBeenCalledWith({
      defaultPath: "data.json",
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
  });

  it("result variant distinguishes saved / cancelled / failed (Bell №5)", async () => {
    mockTauriInternals();
    const dialog = await import("@tauri-apps/plugin-dialog");
    const fs = await import("@tauri-apps/plugin-fs");
    const { saveFileDialogResult } = await import("./nativeWindow");

    vi.mocked(dialog.save).mockResolvedValue("/save/a.srt");
    expect(await saveFileDialogResult("x", "a.srt")).toEqual({ status: "saved", path: "/save/a.srt" });

    vi.mocked(dialog.save).mockResolvedValue(null);
    expect(await saveFileDialogResult("x", "a.srt")).toEqual({ status: "cancelled" });

    vi.mocked(dialog.save).mockResolvedValue("/save/a.srt");
    vi.mocked(fs.writeTextFile).mockRejectedValueOnce(new Error("denied"));
    expect(await saveFileDialogResult("x", "a.srt")).toEqual({ status: "failed", error: "denied" });
  });
});
