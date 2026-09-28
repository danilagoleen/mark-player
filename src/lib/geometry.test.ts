import { describe, expect, it } from "vitest";
import { computeDisplayedBox, computeDreamScore, LAB_FOOTER_HEIGHT, LAB_MIN_SHELL_HEIGHT, LAB_MIN_SHELL_WIDTH, suggestShellSize } from "./geometry";

describe("player geometry math", () => {
  it("computes side letterboxing for a too-wide viewer", () => {
    const result = computeDisplayedBox(960, 400, 640, 480);
    expect(result.displayedWidth).toBeLessThan(960);
    expect(result.horizontalLetterboxPx).toBeGreaterThan(0);
    expect(result.verticalLetterboxPx).toBe(0);
  });

  it("computes top and bottom letterboxing for a too-tall viewer", () => {
    const result = computeDisplayedBox(640, 700, 640, 480);
    expect(result.displayedHeight).toBeLessThan(700);
    expect(result.verticalLetterboxPx).toBeGreaterThan(0);
  });

  it("suggests a 4:3 shell that includes footer reserve", () => {
    const shell = suggestShellSize(640, 480, 56, 960, 700);
    expect(shell.shellWidth).toBeGreaterThan(360);
    expect(shell.shellHeight).toBeGreaterThan(240);
    expect(shell.shellHeight).toBeGreaterThan(shell.shellWidth / (640 / 480));
  });

  it("suggested shell removes side letterboxing for a 4:3 probe", () => {
    const shell = suggestShellSize(640, 480, LAB_FOOTER_HEIGHT, 1200, 900);
    const viewerHeight = shell.shellHeight - LAB_FOOTER_HEIGHT;
    const result = computeDisplayedBox(shell.shellWidth, viewerHeight, 640, 480);
    expect(result.horizontalLetterboxPx).toBe(0);
  });

  it("suggests a portrait shell for portrait media", () => {
    const shell = suggestShellSize(288, 620, 0, 1400, 900);
    expect(shell.shellHeight).toBeGreaterThan(shell.shellWidth);
  });

  it("0.10.21: portrait shell never undercuts the native minimum width", () => {
    const shell = suggestShellSize(1080, 1920, 0, 1512, 944);
    expect(shell.shellWidth).toBeGreaterThanOrEqual(LAB_MIN_SHELL_WIDTH);
    expect(shell.shellHeight).toBeLessThanOrEqual(944);
    expect(shell.shellHeight).toBeGreaterThan(shell.shellWidth);
  });

  it("0.10.21: landscape default starts at the HD floor", () => {
    const shell = suggestShellSize(1920, 1080, 0, 1600, 1000);
    expect(shell.shellWidth).toBe(1280);
    expect(shell.shellHeight).toBe(720);
  });

  it("0.10.21: suggested shell respects the native minimum on small screens", () => {
    const shell = suggestShellSize(640, 480, 56, 800, 600);
    expect(shell.shellWidth).toBeGreaterThanOrEqual(LAB_MIN_SHELL_WIDTH);
    expect(shell.shellHeight).toBeGreaterThanOrEqual(LAB_MIN_SHELL_HEIGHT);
  });

  it("rewards low chrome and low letterboxing in dream score", () => {
    const strong = computeDreamScore({
      windowInnerWidth: 1280,
      windowInnerHeight: 760,
      topbarHeight: 40,
      footerHeight: 56,
      displayedWidth: 1040,
      displayedHeight: 585,
      horizontalLetterboxPx: 0.2,
      aspectError: 0.0002,
    });
    const weak = computeDreamScore({
      windowInnerWidth: 1280,
      windowInnerHeight: 760,
      topbarHeight: 96,
      footerHeight: 56,
      displayedWidth: 760,
      displayedHeight: 420,
      horizontalLetterboxPx: 18,
      aspectError: 0.02,
    });
    expect(strong.dreamScore).toBeGreaterThan(weak.dreamScore);
  });
});
