import { describe, expect, it } from "vitest";
import {
  BIG_MEDIA_BYTES,
  formatFileSize,
  isBeyondAssetTransport,
  mediaLoadProblemReason,
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

describe("isBeyondAssetTransport", () => {
  it("depends on size only, not on where moov sits", () => {
    expect(isBeyondAssetTransport(info({ size: BIG_MEDIA_BYTES, moov_at_end: true }))).toBe(true);
    expect(isBeyondAssetTransport(info({ size: BIG_MEDIA_BYTES, moov_at_end: false }))).toBe(true);
    expect(isBeyondAssetTransport(info({ size: BIG_MEDIA_BYTES - 1, moov_at_end: true }))).toBe(false);
  });

  it("keeps the measured playable proxy on the asset transport", () => {
    expect(isBeyondAssetTransport(info({ size: 5_247_132_270 }))).toBe(false);
    expect(isBeyondAssetTransport(info({ size: 5_290_106_592 }))).toBe(true);
  });
});

describe("mediaLoadProblemReason", () => {
  it("names size and the transport, not the file layout", () => {
    const text = mediaLoadProblemReason("/idx/Proxies/P1755050.MOV", info({ size: 6_776_854_168, moov_at_end: true }));
    expect(text).toContain("P1755050.MOV");
    expect(text).toContain("6.3 GB");
    expect(text).toContain("Range server");
    expect(text).toContain("#6375/#7355");
    expect(text).not.toContain("faststart");
  });

  it("does not blame the layout for a small file either", () => {
    const text = mediaLoadProblemReason("clip.mov", info({ moov_at_end: true }));
    expect(text).not.toContain("faststart");
    expect(text).toContain("did not start");
  });
});
