import { describe, expect, it, vi } from "vitest";
import {
  clearKindBucket,
  confirmClearMarkers,
  countSparedQuestionReplies,
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

  it("0.22: contentHash — копия чистит свои метки, чужой хеш не трогает", () => {
    const hashed = [
      { marker_id: "h1", kind: "comment", media_path: "orig.mp4", content_hash: "ch1:aaaa" },
      { marker_id: "h2", kind: "favorite", media_path: "orig.mp4", content_hash: "ch1:bbbb" },
      { marker_id: "l1", kind: "comment", media_path: "copy.mp4" },
    ];
    // Открыта копия orig.mp4 (хеш aaaa): своя метка + легаси по пути.
    expect(selectMarkersToClear(hashed, "copy.mp4", "all", "ch1:aaaa").map((m) => m.marker_id)).toEqual(["h1", "l1"]);
    // Без хеша — только путь, как раньше.
    expect(selectMarkersToClear(hashed, "copy.mp4", "all").map((m) => m.marker_id)).toEqual(["l1"]);
  });

  // tb_1791839608_26192_1: Clear не сносит вопросы Беты (иначе карточке не к
  // чему цеплять ответы — кейс 0.25.57).
  // tb_1791845483_63972_1: ответы-реплики на вопросы — тоже не жертвы
  // (единственная правда с 0.25.55, undo сессионный): только поштучно.
  it("qmat-родители, поле question_id и ответы на вопросы — не жертвы даже под all", () => {
    const withQ = [
      ...ALL,
      { marker_id: "qmat_mrg-01_in", kind: "comment", media_path: "a.mp4" },
      { marker_id: "qmat_mrg-01_out", kind: "comment", media_path: "a.mp4" },
      { marker_id: "qm1", kind: "comment", media_path: "a.mp4", question_id: "mrg-02" },
      { marker_id: "reply_1", kind: "favorite", media_path: "a.mp4", reply_to: "qmat_mrg-01_in" },
    ];
    const victims = selectMarkersToClear(withQ, "a.mp4", "all").map((m) => m.marker_id);
    expect(victims).toHaveLength(7);
    expect(victims).not.toContain("reply_1");
    expect(victims.some((id) => id === "qmat_mrg-01_in" || id === "qmat_mrg-01_out" || id === "qm1")).toBe(false);
  });

  it("ответы щадим под своим видом тоже: favorite-скоуп не трогает ★-ответ", () => {
    const markers = [
      { marker_id: "qmat_mrg-01_in", kind: "comment", media_path: "a.mp4" },
      { marker_id: "r1", kind: "favorite", media_path: "a.mp4", reply_to: "qmat_mrg-01_in" },
      { marker_id: "r2", kind: "comment", media_path: "a.mp4", reply_to: "qmat_mrg-01_in" },
      { marker_id: "f1", kind: "favorite", media_path: "a.mp4" },
    ];
    expect(selectMarkersToClear(markers, "a.mp4", "favorite").map((m) => m.marker_id)).toEqual(["f1"]);
    expect(selectMarkersToClear(markers, "a.mp4", "comment").map((m) => m.marker_id)).toEqual([]);
    expect(countSparedQuestionReplies(markers, "a.mp4", "favorite")).toBe(1);
    expect(countSparedQuestionReplies(markers, "a.mp4", "comment")).toBe(1);
    expect(countSparedQuestionReplies(markers, "a.mp4", "all")).toBe(2);
  });

  it("ответ на вопрос без qmat-префикса в id (только поле question_id) — щадим", () => {
    const markers = [
      { marker_id: "qm9", kind: "comment", media_path: "a.mp4", question_id: "mrg-09" },
      { marker_id: "r9", kind: "negative", media_path: "a.mp4", reply_to: "qm9" },
    ];
    expect(selectMarkersToClear(markers, "a.mp4", "all")).toEqual([]);
    expect(countSparedQuestionReplies(markers, "a.mp4", "all")).toBe(1);
  });

  it("reply_to на обычный маркер — жертва как раньше, не ответ", () => {
    const markers = [
      { marker_id: "c1", kind: "comment", media_path: "a.mp4" },
      { marker_id: "t1", kind: "comment", media_path: "a.mp4", reply_to: "c1" },
    ];
    expect(selectMarkersToClear(markers, "a.mp4", "all").map((m) => m.marker_id)).toEqual(["c1", "t1"]);
    expect(countSparedQuestionReplies(markers, "a.mp4", "all")).toBe(0);
  });

  it("родителя нет в массиве: qmat-префикс щадим, обычный id — жертва", () => {
    const markers = [
      { marker_id: "r1", kind: "comment", media_path: "a.mp4", reply_to: "qmat_gone_in" },
      { marker_id: "r2", kind: "comment", media_path: "a.mp4", reply_to: "gone_plain" },
    ];
    expect(selectMarkersToClear(markers, "a.mp4", "all").map((m) => m.marker_id)).toEqual(["r2"]);
    expect(countSparedQuestionReplies(markers, "a.mp4", "all")).toBe(1);
  });

  it("media null → и жертв, и пощажённых ноль", () => {
    expect(countSparedQuestionReplies(ALL, null, "all")).toBe(0);
  });
});

describe("formatClearConfirm (0.21)", () => {
  it("один вид, множественное число", () => {
    expect(formatClearConfirm([
      { kind: "comment", media_path: "a.mp4" },
      { kind: "comment", media_path: "a.mp4" },
    ])).toBe("Delete 2 comments (2 markers of this video)? Question markers are kept. You can bring the rest back with Undo (Cmd+Z).");
  });

  it("единственное число + in/out одним ведром", () => {
    expect(formatClearConfirm([
      { kind: "favorite", media_path: "a.mp4" },
      { kind: "in", media_path: "a.mp4" },
      { kind: "out", media_path: "a.mp4" },
    ])).toBe(
      "Delete 1 favorite and 2 in/out points (3 markers of this video)? Question markers are kept. You can bring the rest back with Undo (Cmd+Z).",
    );
  });

  it("пощажённые ответы — честная строка в confirm (мн./ед. число)", () => {
    expect(formatClearConfirm([{ kind: "comment", media_path: "a.mp4" }], 2)).toBe(
      "Delete 1 comment (1 marker of this video)? Question markers and 2 question replies are kept. You can bring the rest back with Undo (Cmd+Z).",
    );
    expect(formatClearConfirm([{ kind: "comment", media_path: "a.mp4" }], 1)).toContain(
      "Question markers and 1 question reply are kept.",
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
