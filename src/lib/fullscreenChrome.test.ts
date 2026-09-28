import { describe, expect, it } from "vitest";
import { FULLSCREEN_CHROME_TIMEOUT_MS, resolveChromeHidden } from "./fullscreenChrome";

// 0.12 слайс: автоскрытие хрома ТОЛЬКО в фулскрине.
describe("resolveChromeHidden", () => {
  it("windowed: хром всегда видим (плеер для маркирования)", () => {
    expect(resolveChromeHidden(false, 0)).toBe(false);
    expect(resolveChromeHidden(false, 60_000)).toBe(false);
  });

  it("fullscreen: вход прячет сразу, движение показывает, 2с тишины прячут", () => {
    expect(resolveChromeHidden(true, Number.POSITIVE_INFINITY)).toBe(true);
    expect(resolveChromeHidden(true, 0)).toBe(false);
    expect(resolveChromeHidden(true, FULLSCREEN_CHROME_TIMEOUT_MS - 1)).toBe(false);
    expect(resolveChromeHidden(true, FULLSCREEN_CHROME_TIMEOUT_MS)).toBe(true);
  });

  it("таймаут 2с по умолчанию", () => {
    expect(FULLSCREEN_CHROME_TIMEOUT_MS).toBe(2000);
  });
});
