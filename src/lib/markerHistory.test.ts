import { describe, expect, it, vi } from "vitest";
import {
  clearKindBucket,
  confirmClearMarkers,
  createMarkerHistory,
  formatClearConfirm,
  historyCanRedo,
  historyCanUndo,
  historyPush,
  historyRedo,
  historyUndo,
  selectMarkersToClear,
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

describe("selectMarkersToClear (0.21 clear by kind)", () => {
  const ALL = [
    { marker_id: "c1", kind: "comment", media_path: "a.mp4" },
    { marker_id: "c2", kind: "comment", media_path: "a.mp4" },
    { marker_id: "f1", kind: "favorite", media_path: "a.mp4" },
    { marker_id: "n1", kind: "negative", media_path: "a.mp4" },
    { marker_id: "i1", kind: "in", media_path: "a.mp4" },
    { marker_id: "o1", kind: "out", media_path: "a.mp4" },
    { marker_id: "h1", kind: "chat", media_path: "a.mp4" },
    { marker_id: "x1", kind: "comment", media_path: "b.mp4" },
  ];

  it("scopes: comment/favorite/negative/inout режут по виду", () => {
    expect(selectMarkersToClear(ALL, "a.mp4", "comment").map((m) => m.marker_id)).toEqual(["c1", "c2"]);
    expect(selectMarkersToClear(ALL, "a.mp4", "favorite").map((m) => m.marker_id)).toEqual(["f1"]);
    expect(selectMarkersToClear(ALL, "a.mp4", "negative").map((m) => m.marker_id)).toEqual(["n1"]);
    expect(selectMarkersToClear(ALL, "a.mp4", "inout").map((m) => m.marker_id)).toEqual(["i1", "o1"]);
  });

  it("all забирает всё текущего видео, включая chat, чужие не трогает", () => {
    const victims = selectMarkersToClear(ALL, "a.mp4", "all");
    expect(victims).toHaveLength(7);
    expect(victims.some((m) => m.marker_id === "x1")).toBe(false);
  });

  it("media null → пусто", () => {
    expect(selectMarkersToClear(ALL, null, "all")).toEqual([]);
  });

  it("in/out идут одним ведром", () => {
    expect(clearKindBucket("in")).toBe("inout");
    expect(clearKindBucket("out")).toBe("inout");
    expect(clearKindBucket("comment")).toBe("comment");
  });
});

describe("formatClearConfirm (0.21)", () => {
  it("один вид, множественное число", () => {
    expect(formatClearConfirm([
      { kind: "comment", media_path: "a.mp4" },
      { kind: "comment", media_path: "a.mp4" },
    ])).toBe("Delete 2 comments (2 markers of this video)? You can bring them back with Undo (Cmd+Z).");
  });

  it("единственное число + in/out одним ведром", () => {
    expect(formatClearConfirm([
      { kind: "favorite", media_path: "a.mp4" },
      { kind: "in", media_path: "a.mp4" },
      { kind: "out", media_path: "a.mp4" },
    ])).toBe(
      "Delete 1 favorite and 2 in/out points (3 markers of this video)? You can bring them back with Undo (Cmd+Z).",
    );
  });
});

describe("confirmClearMarkers (0.21)", () => {
  it("пусто → false без вопросов", async () => {
    await expect(confirmClearMarkers([])).resolves.toBe(false);
  });

  it("в браузере спрашивает window.confirm с разбивкой", async () => {
    const spy = vi.spyOn(window, "confirm").mockReturnValue(true);
    try {
      const victims = [
        { kind: "comment", media_path: "a.mp4" },
        { kind: "favorite", media_path: "a.mp4" },
      ];
      await expect(confirmClearMarkers(victims)).resolves.toBe(true);
      expect(spy).toHaveBeenCalledOnce();
      const msg = String(spy.mock.calls[0][0]);
      expect(msg).toContain("1 comment");
      expect(msg).toContain("1 favorite");
    } finally {
      spy.mockRestore();
    }
  });
});
