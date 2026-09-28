import { describe, expect, it, vi } from "vitest";
import { buildFoveaContext, captureFrame } from "./fovea";

function createMockVideo(overrides: Partial<HTMLVideoElement> = {}): HTMLVideoElement {
  return {
    videoWidth: 320,
    videoHeight: 240,
    currentTime: 42.5,
    duration: 120,
    paused: false,
    ...overrides,
  } as unknown as HTMLVideoElement;
}

describe("captureFrame", () => {
  it("returns null for video with no dimensions", () => {
    const video = createMockVideo({ videoWidth: 0, videoHeight: 0 });
    const result = captureFrame(video);
    expect(result).toBeNull();
  });

  it("draws on canvas and returns dataURL", () => {
    const drawImage = vi.fn();
    const toDataURL = vi.fn(() => "data:image/jpeg;base64,fake");
    const mockCtx = { drawImage } as unknown as CanvasRenderingContext2D;
    const getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => mockCtx as never);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(toDataURL as never);

    const video = createMockVideo();
    const result = captureFrame(video);

    expect(result).toBe("data:image/jpeg;base64,fake");
    expect(getContextSpy).toHaveBeenCalledWith("2d");
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 320, 240);
    vi.restoreAllMocks();
  });

  it("returns null if canvas 2d context unavailable", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => null as never);

    const video = createMockVideo();
    const result = captureFrame(video);
    expect(result).toBeNull();

    vi.restoreAllMocks();
  });

  it("applies quality parameter to toDataURL", () => {
    const toDataURL = vi.fn(() => "data:image/jpeg;base64,fake");
    const mockCtx = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => mockCtx as never);

    const video = createMockVideo();
    captureFrame(video, 0.3);
    expect(toDataURL).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});

describe("buildFoveaContext", () => {
  it("returns context with valid timecode", () => {
    const video = createMockVideo();
    const ctx = buildFoveaContext(video);
    expect(ctx.timecode).toBe("00:00:42.500");
    expect(ctx.duration).toBe(120);
    expect(ctx.width).toBe(320);
    expect(ctx.height).toBe(240);
  });

  it("handles zero currentTime", () => {
    const video = createMockVideo({ currentTime: 0 });
    const ctx = buildFoveaContext(video);
    expect(ctx.timecode).toBe("00:00:00.000");
  });
});

describe("analyzeFrame", () => {
  it("sends frame to analyze-frame endpoint and returns vision data", async () => {
    const fakeVision = {
      shot_scale: "medium",
      angle: "eye_level",
      dominant_colors: ["#b2341f", "#1c2b3f"],
      light_profile: "balanced",
      sharpness_score: 120.5,
      scene_class: "clear",
      faces: 0,
      objects: [],
    };
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => fakeVision,
    });
    vi.stubGlobal("fetch", mockFetch);

    const { analyzeFrame } = await import("./fovea");
    const result = await analyzeFrame("data:image/jpeg;base64,fake");
    expect(result).toEqual(fakeVision);
    expect(mockFetch.mock.calls[0][0]).toContain("/api/cut/analyze-frame");

    vi.unstubAllGlobals();
  });

  it("returns null on API error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    const { analyzeFrame } = await import("./fovea");
    const result = await analyzeFrame("data:image/jpeg;base64,fake");
    expect(result).toBeNull();
    vi.unstubAllGlobals();
  });

  it("returns null on network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fail")));
    const { analyzeFrame } = await import("./fovea");
    const result = await analyzeFrame("data:image/jpeg;base64,fake");
    expect(result).toBeNull();
    vi.unstubAllGlobals();
  });
});
