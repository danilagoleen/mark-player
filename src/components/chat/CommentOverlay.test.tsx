import { describe, expect, it } from "vitest";
import { selectVisibleRows, type KindFilter } from "./CommentOverlay";

type M = {
  marker_id: string;
  kind: string;
  start_sec: number;
  reply_to?: string;
};

// tb_1791843894_63972_1: нитка mrg-03 (qmat + ✕-ответ) и нитка mrg-04
// (qmat + ★-ответ) + одиночный коммент + одиночный ★.
const THREADS: M[] = [
  { marker_id: "qmat_mrg-03_in", kind: "comment", start_sec: 30 },
  { marker_id: "ans03", kind: "negative", start_sec: 31, reply_to: "qmat_mrg-03_in" },
  { marker_id: "qmat_mrg-04_in", kind: "comment", start_sec: 40 },
  { marker_id: "ans04", kind: "favorite", start_sec: 41, reply_to: "qmat_mrg-04_in" },
  { marker_id: "solo_comment", kind: "comment", start_sec: 10 },
  { marker_id: "solo_fav", kind: "favorite", start_sec: 20 },
];

const ids = (ms: M[]) => ms.map((m) => m.marker_id);

describe("selectVisibleRows (tb_1791843894_63972_1)", () => {
  it("all: всё подряд, хроно", () => {
    expect(ids(selectVisibleRows(THREADS, "all" as KindFilter))).toEqual([
      "solo_comment",
      "solo_fav",
      "qmat_mrg-03_in",
      "ans03",
      "qmat_mrg-04_in",
      "ans04",
    ]);
  });

  it("★: свои маркеры + свои ответы + родители; чужая нитка (только ✕) скрыта", () => {
    expect(ids(selectVisibleRows(THREADS, "favorite" as KindFilter))).toEqual([
      "solo_fav",
      "qmat_mrg-04_in",
      "ans04",
    ]);
  });

  it("✕: зеркально — нитка с одним ★ скрыта", () => {
    expect(ids(selectVisibleRows(THREADS, "negative" as KindFilter))).toEqual([
      "qmat_mrg-03_in",
      "ans03",
    ]);
  });

  it("💬: всё обсуждение — комменты + ответы всех видов + родители", () => {
    expect(ids(selectVisibleRows(THREADS, "comment" as KindFilter))).toEqual([
      "solo_comment",
      "qmat_mrg-03_in",
      "ans03",
      "qmat_mrg-04_in",
      "ans04",
    ]);
  });

  it("сирота (родителя нет в списке) своим видом видна, чужим — нет", () => {
    const orphan: M[] = [{ marker_id: "orph", kind: "favorite", start_sec: 5, reply_to: "gone" }];
    expect(ids(selectVisibleRows(orphan, "favorite" as KindFilter))).toEqual(["orph"]);
    expect(ids(selectVisibleRows(orphan, "negative" as KindFilter))).toEqual([]);
  });

  it("in-фильтр: in-маркеры + их родители, ответы-вердикты не лезут", () => {
    const ms: M[] = [
      { marker_id: "i1", kind: "in", start_sec: 1 },
      { marker_id: "o1", kind: "out", start_sec: 9 },
      { marker_id: "q", kind: "comment", start_sec: 2 },
      { marker_id: "a", kind: "favorite", start_sec: 3, reply_to: "q" },
    ];
    expect(ids(selectVisibleRows(ms, "in" as KindFilter))).toEqual(["i1"]);
    expect(ids(selectVisibleRows(ms, "out" as KindFilter))).toEqual(["o1"]);
  });
});
