import { describe, expect, it, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { CommentOverlay } from "./components/chat/CommentOverlay";

const MARKERS = [
  { marker_id: "m1", kind: "comment", start_sec: 1, text: "first" },
  { marker_id: "m2", kind: "comment", start_sec: 3, text: "second" },
];

function renderTwoSelectedFirst() {
  const onUpdateText = vi.fn();
  const onDeleteMarker = vi.fn();
  const utils = render(
    <CommentOverlay
      marker={MARKERS[0]}
      markers={MARKERS}
      onClose={() => {}}
      onUpdateText={onUpdateText}
      onDeleteMarker={onDeleteMarker}
      standalone
    />,
  );
  return { ...utils, onUpdateText, onDeleteMarker };
}

function buttonsByName(container: HTMLElement, name: string): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll("button")).filter(
    (b) => b.textContent === name,
  ) as HTMLButtonElement[];
}

describe("CommentOverlay (баг 2026-09-27: правится только выбранный)", () => {
  it("Edit есть у КАЖДОГО коммента, а не только у ?marker=", () => {
    const { container } = renderTwoSelectedFirst();
    expect(buttonsByName(container, "Edit")).toHaveLength(2);
  });

  it("Save второго коммента зовёт onUpdateText с его id", () => {
    const { container, onUpdateText } = renderTwoSelectedFirst();
    fireEvent.click(buttonsByName(container, "Edit")[1]);
    const area = container.querySelector("textarea")!;
    fireEvent.change(area, { target: { value: "second edited" } });
    fireEvent.click(buttonsByName(container, "Save")[0]);
    expect(onUpdateText).toHaveBeenCalledWith("m2", "second edited");
  });

  it("Delete есть у каждого коммента и зовёт onDeleteMarker с его id", () => {
    const { container, onDeleteMarker } = renderTwoSelectedFirst();
    const dels = buttonsByName(container, "Delete");
    expect(dels).toHaveLength(2);
    fireEvent.click(dels[0]);
    expect(onDeleteMarker).toHaveBeenCalledWith("m1");
  });
});

describe("CommentOverlay Clear all (0.20)", () => {
  it("кнопка видна с onClearAll и зовёт его", () => {
    const onClearAll = vi.fn();
    const { container } = render(
      <CommentOverlay
        marker={MARKERS[0]}
        markers={MARKERS}
        onClose={() => {}}
        onUpdateText={() => {}}
        onDeleteMarker={() => {}}
        onClearAll={onClearAll}
        standalone
      />,
    );
    const btns = buttonsByName(container, "Clear all");
    expect(btns).toHaveLength(1);
    fireEvent.click(btns[0]);
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });

  it("кнопки нет без onClearAll", () => {
    const { container } = renderTwoSelectedFirst();
    expect(buttonsByName(container, "Clear all")).toHaveLength(0);
  });
});
