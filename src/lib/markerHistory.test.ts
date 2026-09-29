import { describe, expect, it } from "vitest";
import {
  createMarkerHistory,
  historyCanRedo,
  historyCanUndo,
  historyPush,
  historyRedo,
  historyUndo,
} from "./markerHistory";

describe("markerHistory (0.20 undo/redo)", () => {
  it("empty stack: cannot undo or redo", () => {
    const h = createMarkerHistory<string[]>();
    expect(historyCanUndo(h)).toBe(false);
    expect(historyCanRedo(h)).toBe(false);
    expect(historyUndo(h, [])).toBeNull();
    expect(historyRedo(h, [])).toBeNull();
  });

  it("push → undo restores the before-snapshot", () => {
    let h = createMarkerHistory<string>();
    h = historyPush(h, ["a"]);
    expect(historyCanUndo(h)).toBe(true);
    const undone = historyUndo(h, ["a", "b"]);
    expect(undone?.snapshot).toEqual(["a"]);
    expect(historyCanUndo(undone!.history)).toBe(false);
    expect(historyCanRedo(undone!.history)).toBe(true);
  });

  it("undo → redo returns the undone state", () => {
    let h = createMarkerHistory<string>();
    h = historyPush(h, ["a"]);
    const undone = historyUndo(h, ["a", "b"])!;
    const redone = historyRedo(undone.history, undone.snapshot)!;
    expect(redone.snapshot).toEqual(["a", "b"]);
    expect(historyCanRedo(redone.history)).toBe(false);
    expect(historyCanUndo(redone.history)).toBe(true);
  });

  it("new push invalidates redo", () => {
    let h = createMarkerHistory<string>();
    h = historyPush(h, ["a"]);
    const undone = historyUndo(h, ["a", "b"])!;
    expect(historyCanRedo(undone.history)).toBe(true);
    h = historyPush(undone.history, ["c"]);
    expect(historyCanRedo(h)).toBe(false);
    expect(historyRedo(h, ["c", "d"])).toBeNull();
  });

  it("multi-step undo walks back one step at a time", () => {
    let h = createMarkerHistory<string>();
    h = historyPush(h, ["a"]);
    h = historyPush(h, ["a", "b"]);
    const first = historyUndo(h, ["a", "b", "c"])!;
    expect(first.snapshot).toEqual(["a", "b"]);
    const second = historyUndo(first.history, first.snapshot)!;
    expect(second.snapshot).toEqual(["a"]);
    expect(historyCanUndo(second.history)).toBe(false);
  });

  it("cap drops the oldest snapshots", () => {
    let h = createMarkerHistory<string>(2);
    h = historyPush(h, ["a"]);
    h = historyPush(h, ["b"]);
    h = historyPush(h, ["c"]);
    const first = historyUndo(h, ["d"])!;
    expect(first.snapshot).toEqual(["c"]);
    const second = historyUndo(first.history, first.snapshot)!;
    expect(second.snapshot).toEqual(["b"]);
    expect(historyCanUndo(second.history)).toBe(false);
  });

  it("does not mutate the input history", () => {
    const h = createMarkerHistory<string>();
    const pushed = historyPush(h, ["a"]);
    expect(h.past).toEqual([]);
    expect(pushed.past).toEqual([["a"]]);
  });
});
