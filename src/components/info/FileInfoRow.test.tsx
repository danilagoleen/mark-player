import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { FileInfoRow } from "./FileInfoRow";
import type { ProbeResult } from "../../lib/nativeWindow";

function makeProbe(overrides: Partial<ProbeResult> = {}): ProbeResult {
  return {
    ok: true,
    path: "/test/video.mp4",
    exists: true,
    container: "mp4",
    duration_sec: 120,
    bitrate_kbps: 5000,
    file_size_bytes: 1000000,
    video_codec: "h264",
    audio_codec: "aac",
    width: 1920,
    height: 1080,
    fps: 23.976,
    pix_fmt: "yuv420p",
    color_space: "bt709",
    bit_depth: 8,
    codec_family: "avc",
    playback_class: "native",
    error: "",
    ...overrides,
  };
}

describe("FileInfoRow", () => {
  afterEach(cleanup);
  it("renders codec, resolution and fps", () => {
    render(<FileInfoRow probe={makeProbe()} />);
    expect(screen.getByText("h264")).toBeTruthy();
    expect(screen.getByText(/1920/)).toBeTruthy();
    expect(screen.getByText(/23\.98/)).toBeTruthy();
  });

  it("shows native class icon", () => {
    render(<FileInfoRow probe={makeProbe()} />);
    expect(screen.getByText("\u25B6")).toBeTruthy();
  });

  it("shows proxy class icon", () => {
    render(<FileInfoRow probe={makeProbe({ playback_class: "proxy" })} />);
    expect(screen.getByText("\u21C6")).toBeTruthy();
  });

  it("omits fps when missing", () => {
    render(<FileInfoRow probe={makeProbe({ fps: 0 })} />);
    expect(screen.queryByText(/fps/)).toBeNull();
  });
});
