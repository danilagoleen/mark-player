import { describe, expect, it } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SubtitleOverlay } from "./SubtitleOverlay";
import { afterEach } from "vitest";

// tb_1791156671_82609_1: оверлей виден только при активной реплике.
describe("SubtitleOverlay", () => {
  afterEach(cleanup);

  it("renders cue text with frame-relative font size", () => {
    render(
      <SubtitleOverlay
        cues={[{ start: 1, end: 3, text: "Line one\nLine two" }]}
        frameHeight={800}
      />,
    );
    const cue = screen.getByTestId("subtitle-overlay");
    expect(cue.textContent).toContain("Line one");
    const line = cue.firstElementChild as HTMLElement;
    expect(line.style.fontSize).toBe("36px");
  });

  it("renders nothing without cues", () => {
    const { container } = render(<SubtitleOverlay cues={[]} frameHeight={800} />);
    expect(container.firstChild).toBeNull();
  });
});
