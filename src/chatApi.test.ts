import { describe, expect, it, vi } from "vitest";
import type { FoveaContext, VisionAnalysis } from "./fovea";
import { sendChatMessage } from "./chatApi";

const fakeContext: FoveaContext = {
  timecode: "00:01:23.456",
  frame_b64: "data:image/jpeg;base64,fake",
  width: 320,
  height: 240,
  duration: 120,
};

const fakeVision: VisionAnalysis = {
  shot_scale: "medium",
  angle: "eye_level",
  dominant_colors: ["#b2341f", "#1c2b3f"],
  light_profile: "balanced",
  sharpness_score: 120.5,
  scene_class: "clear",
  faces: 0,
  objects: [],
};

describe("sendChatMessage", () => {
  it("sends text and fovea context to API", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        reply: "I see a red frame.",
        role: "assistant",
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const reply = await sendChatMessage("What do you see?", fakeContext);
    expect(reply.role).toBe("assistant");
    expect(reply.text).toBe("I see a red frame.");

    const callUrl = mockFetch.mock.calls[0][0];
    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callUrl).toContain("/api/cut/chat");
    expect(callBody.text).toBe("What do you see?");
    expect(callBody.fovea.timecode).toBe("00:01:23.456");
    expect(callBody.fovea.frame_b64).toBe(fakeContext.frame_b64);

    vi.unstubAllGlobals();
  });

  it("sends vision context alongside fovea", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        reply: "Medium shot, eye-level angle.",
        role: "assistant",
        vision: fakeVision,
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const reply = await sendChatMessage("Describe frame.", fakeContext, fakeVision);
    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);

    expect(callBody.vision.shot_scale).toBe("medium");
    expect(callBody.vision.dominant_colors).toEqual(["#b2341f", "#1c2b3f"]);
    expect(reply.vision?.shot_scale).toBe("medium");

    vi.unstubAllGlobals();
  });

  it("returns error message on network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

    const reply = await sendChatMessage("test", fakeContext);
    expect(reply.role).toBe("system");
    expect(reply.text).toContain("Network error");

    vi.unstubAllGlobals();
  });

  it("returns error message on non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: { message: "Server error" } }),
    }));

    const reply = await sendChatMessage("test", fakeContext);
    expect(reply.role).toBe("system");
    expect(reply.text).toContain("Server error");

    vi.unstubAllGlobals();
  });
});
