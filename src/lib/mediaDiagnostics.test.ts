import { describe, expect, it } from "vitest";
import {
  BIG_MEDIA_BYTES,
  formatFileSize,
  isLargeNonFaststart,
  mediaLoadProblemReason,
  mediaRiskNotice,
  shouldWarnBeforePlayback,
  type MediaContainerInfo,
} from "./mediaDiagnostics";

const info = (over: Partial<MediaContainerInfo> = {}): MediaContainerInfo => ({
  size: 100 * 1024 * 1024,
  moov_offset: 20,
  mdat_offset: 60,
  moov_at_end: false,
  ...over,
});

describe("formatFileSize", () => {
  it("uses GB for the reported proxy size", () => {
    expect(formatFileSize(6_776_854_168)).toBe("6.3 GB");
    expect(formatFileSize(875 * 1024 * 1024)).toBe("875 MB");
    expect(formatFileSize(0)).toBe("0 B");
  });
});

describe("isLargeNonFaststart", () => {
  it("is true only for big files with the index at the end", () => {
    expect(isLargeNonFaststart(info({ size: BIG_MEDIA_BYTES, moov_at_end: true }))).toBe(true);
    expect(isLargeNonFaststart(info({ size: BIG_MEDIA_BYTES, moov_at_end: false }))).toBe(false);
    expect(isLargeNonFaststart(info({ size: BIG_MEDIA_BYTES - 1, moov_at_end: true }))).toBe(false);
  });
});

describe("shouldWarnBeforePlayback", () => {
  it("warns only when the cause is already known", () => {
    expect(shouldWarnBeforePlayback(null)).toBe(false);
    expect(shouldWarnBeforePlayback(info({ moov_at_end: true }))).toBe(false);
    expect(shouldWarnBeforePlayback(info({ size: BIG_MEDIA_BYTES, moov_at_end: true }))).toBe(true);
  });
});

describe("mediaLoadProblemReason", () => {
  it("names size, moov-at-end and the upstream limitation", () => {
    const text = mediaLoadProblemReason("/idx/Proxies/P1755050.MOV", info({ size: 6_776_854_168, moov_at_end: true }));
    expect(text).toContain("P1755050.MOV");
    expect(text).toContain("6.3 GB");
    expect(text).toContain("moov");
    expect(text).toContain("faststart");
    expect(text).toContain("#6375/#7355");
  });

  it("still gives a reason for an unknown container", () => {
    expect(mediaLoadProblemReason("clip.mov", info())).toContain("faststart");
  });
});

describe("mediaRiskNotice", () => {
  it("warns before playback without claiming it already failed", () => {
    const text = mediaRiskNotice("/idx/Proxies/P1755050.MOV", info({ size: 6_776_854_168, moov_at_end: true }));
    expect(text).toContain("P1755050.MOV");
    expect(text).toContain("6.3 GB");
    expect(text).toContain("unlikely to play");
    expect(text).toContain("#6375/#7355");
  });
});
