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

  // tb_1791143015_70644_11: бейдж detected → authored.
  it("shows NTSC honesty badge on fractional container fps", () => {
    render(
      <FileInfoRow
        probe={makeProbe({ fps: 29.97 })}
        honesty={{ detected: 29.97, authoredTimebase: 30, ntsc: true, mismatch: true, badge: "29.97 → 30 NTSC" }}
      />,
    );
    const badge = screen.getByText("29.97 → 30 NTSC");
    expect(badge.getAttribute("class") || "").toContain("fi-fps-warn");
    expect(badge.getAttribute("title") || "").toContain("verify fps in NLE");
  });

  it("shows plain badge on integer fps, hides badge without honesty", () => {
    const { rerender } = render(
      <FileInfoRow
        probe={makeProbe({ fps: 25 })}
        honesty={{ detected: 25, authoredTimebase: 25, ntsc: false, mismatch: false, badge: "25" }}
      />,
    );
    expect(screen.getByText("25").getAttribute("class") || "").not.toContain("fi-fps-warn");
    rerender(<FileInfoRow probe={makeProbe({ fps: 25 })} />);
    expect(screen.queryByText("25")).toBeNull();
  });
});
