import { describe, expect, it, vi } from "vitest";
import { pauseBeforeMarkerJump } from "./markerJump";

describe("pauseBeforeMarkerJump", () => {
  it("не трогает видео на паузе", () => {
    const video = { paused: true, pause: vi.fn() };
    expect(pauseBeforeMarkerJump(video)).toBe(false);
    expect(video.pause).not.toHaveBeenCalled();
  });

  it("ставит играющее видео на паузу", () => {
    const video = { paused: false, pause: vi.fn() };
    expect(pauseBeforeMarkerJump(video)).toBe(true);
    expect(video.pause).toHaveBeenCalledTimes(1);
  });

  it("терпит отсутствие видео", () => {
    expect(pauseBeforeMarkerJump(null)).toBe(false);
    expect(pauseBeforeMarkerJump(undefined)).toBe(false);
  });
});
