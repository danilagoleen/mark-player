import { describe, expect, it } from "vitest";
import { SCRUB_PREVIEW_TIMEOUT_MS, isScrubSettled } from "./scrubSeek";

describe("scrubSeek", () => {
  it("preview снимается только когда факт догнал запрошенную точку", () => {
    expect(isScrubSettled(42, 42)).toBe(true);
    expect(isScrubSettled(42, 41.85)).toBe(true);
    expect(isScrubSettled(42, 41.5)).toBe(false);
  });

  it("NaN не считается успокоением", () => {
    expect(isScrubSettled(Number.NaN, 10)).toBe(false);
    expect(isScrubSettled(10, Number.NaN)).toBe(false);
  });

  it("страховочный таймаут preview — положительный и конечный", () => {
    expect(SCRUB_PREVIEW_TIMEOUT_MS).toBeGreaterThan(0);
    expect(Number.isFinite(SCRUB_PREVIEW_TIMEOUT_MS)).toBe(true);
  });
});
