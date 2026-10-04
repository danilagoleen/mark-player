import { afterEach, describe, expect, it, vi } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
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
    (b) => b.textContent === name || b.getAttribute("aria-label") === name,
  ) as HTMLButtonElement[];
}

afterEach(() => {
  vi.useRealTimers();
});

describe("CommentOverlay (баг 2026-09-27: правится только выбранный)", () => {
  it("Edit есть у КАЖДОГО коммента, а не только у ?marker=", () => {
    const { container } = renderTwoSelectedFirst();
    expect(buttonsByName(container, "Edit comment")).toHaveLength(2);
  });

  it("Save второго коммента зовёт onUpdateText с его id", () => {
    const { container, onUpdateText } = renderTwoSelectedFirst();
    fireEvent.click(buttonsByName(container, "Edit comment")[1]);
    const area = container.querySelector("textarea")!;
    fireEvent.change(area, { target: { value: "second edited" } });
    fireEvent.click(buttonsByName(container, "Save")[0]);
    expect(onUpdateText).toHaveBeenCalledWith("m2", "second edited");
  });

  it("Delete есть у каждого коммента; второй клик зовёт onDeleteMarker с его id", () => {
    const { container, onDeleteMarker } = renderTwoSelectedFirst();
    const dels = buttonsByName(container, "Delete comment");
    expect(dels).toHaveLength(2);
    fireEvent.click(dels[0]);
    expect(onDeleteMarker).not.toHaveBeenCalled();
    fireEvent.click(buttonsByName(container, "Confirm delete")[0]);
    expect(onDeleteMarker).toHaveBeenCalledWith("m1");
  });
});

describe("CommentOverlay двухкликовое удаление (0.25, без красного)", () => {
  it("первый клик только взводит штриховку, ничего не удаляет", () => {
    const { container, onDeleteMarker } = renderTwoSelectedFirst();
    fireEvent.click(buttonsByName(container, "Delete comment")[1]);
    expect(onDeleteMarker).not.toHaveBeenCalled();
    expect(container.querySelectorAll('[data-armed="true"]').length).toBeGreaterThan(0);
  });

  it("клик по другой корзине переносит взвод, удаляется только вторая", () => {
    const { container, onDeleteMarker } = renderTwoSelectedFirst();
    fireEvent.click(buttonsByName(container, "Delete comment")[0]);
    fireEvent.click(buttonsByName(container, "Delete comment")[0]);
    expect(onDeleteMarker).not.toHaveBeenCalled();
    expect(container.querySelectorAll('button[data-armed="true"]')).toHaveLength(1);
    fireEvent.click(buttonsByName(container, "Confirm delete")[0]);
    expect(onDeleteMarker).toHaveBeenCalledTimes(1);
    expect(onDeleteMarker).toHaveBeenCalledWith("m2");
  });

  it("взвод гаснет сам через 3 с", () => {
    vi.useFakeTimers();
    const { container, onDeleteMarker } = renderTwoSelectedFirst();
    fireEvent.click(buttonsByName(container, "Delete comment")[0]);
    act(() => { vi.advanceTimersByTime(3100); });
    expect(container.querySelectorAll('[data-armed="true"]')).toHaveLength(0);
    fireEvent.click(buttonsByName(container, "Delete comment")[0]);
    expect(onDeleteMarker).not.toHaveBeenCalled();
  });

  it("в разметке нет красного", () => {
    const { container } = renderTwoSelectedFirst();
    expect(container.innerHTML).not.toMatch(/f87171|248,\s*113,\s*113|#f00|red/i);
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
