import { describe, expect, it } from "vitest";
import {
  captureFullscreenTrace,
  emptyRect,
  isFullscreenLayoutSane,
  rectOf,
  type FullscreenGeometryTrace,
} from "./fullscreenLayout";

function trace(over: {
  isFullscreen?: boolean;
  windowInnerWidth?: number;
  windowInnerHeight?: number;
  shellW?: number;
  shellH?: number;
  viewerW?: number;
  viewerH?: number;
  videoW?: number;
  videoH?: number;
}): FullscreenGeometryTrace {
  return captureFullscreenTrace({
    isFullscreen: over.isFullscreen ?? true,
    windowInnerWidth: over.windowInnerWidth ?? 1440,
    windowInnerHeight: over.windowInnerHeight ?? 900,
    devicePixelRatio: 2,
    shellRect: { width: over.shellW ?? 1440, height: over.shellH ?? 900, top: 0, left: 0 },
    viewerRect: { width: over.viewerW ?? 1440, height: over.viewerH ?? 844, top: 0, left: 0 },
    videoRect: { width: over.videoW ?? 1440, height: over.videoH ?? 810, top: 0, left: 0 },
  });
}

describe("isFullscreenLayoutSane", () => {
  it("здоровый фулскрин — sane", () => {
    expect(isFullscreenLayoutSane(trace({}))).toBe(true);
  });

  it("сигнатура бага (кадр ~треть высоты, чернота снизу) — insane", () => {
    expect(
      isFullscreenLayoutSane(
        trace({ shellW: 800, shellH: 300, viewerW: 800, viewerH: 244, videoW: 800, videoH: 300 }),
      ),
    ).toBe(false);
  });

  it("ровно половина высоты — граница sane", () => {
    expect(isFullscreenLayoutSane(trace({ videoH: 450, windowInnerHeight: 900 }))).toBe(true);
    expect(isFullscreenLayoutSane(trace({ videoH: 449, windowInnerHeight: 900 }))).toBe(false);
  });

  it("нулевое видео в фулскрине — insane", () => {
    expect(isFullscreenLayoutSane(trace({ videoW: 0, videoH: 0 }))).toBe(false);
  });

  it("вне фулскрина судить не о чем — всегда sane", () => {
    expect(isFullscreenLayoutSane(trace({ isFullscreen: false, videoW: 0, videoH: 0 }))).toBe(true);
  });

  it("нулевое окно — не ложный insane", () => {
    expect(isFullscreenLayoutSane(trace({ windowInnerHeight: 0 }))).toBe(true);
  });
});

describe("rectOf", () => {
  it("null → пустой rect", () => {
    expect(rectOf(null)).toEqual(emptyRect());
  });

  it("снимает width/height/top/left", () => {
    expect(
      rectOf({ getBoundingClientRect: () => ({ width: 10, height: 20, top: 5, left: 7 }) }),
    ).toEqual({ width: 10, height: 20, top: 5, left: 7 });
  });
});
