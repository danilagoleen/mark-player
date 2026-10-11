import { describe, expect, it } from "vitest";
import { pairInOutRanges, sumSelectionSeconds } from "./selectionDuration";

describe("sumSelectionSeconds", () => {
  it("пусто — ноль", () => {
    expect(sumSelectionSeconds([], 60)).toBe(0);
  });

  it("одна пара — её длина", () => {
    expect(sumSelectionSeconds([{ start: 10, end: 25 }], 60)).toBe(15);
  });

  it("несколько пар — сумма", () => {
    expect(
      sumSelectionSeconds(
        [
          { start: 0, end: 10 },
          { start: 20, end: 45 },
          { start: 50, end: 55 },
        ],
        60,
      ),
    ).toBe(40);
  });

  it("одиночки в пары не входят — сюда они не доходят, пусто даёт ноль", () => {
    expect(sumSelectionSeconds([], 60)).toBe(0);
  });

  it("перевёрнутая пара (out раньше in) — ноль, а не минус", () => {
    expect(sumSelectionSeconds([{ start: 30, end: 10 }], 60)).toBe(0);
  });

  it("кламп под длительность: end за duration режется", () => {
    expect(sumSelectionSeconds([{ start: 50, end: 999 }], 60)).toBe(10);
  });

  it("отрицательный start режется в ноль", () => {
    expect(sumSelectionSeconds([{ start: -5, end: 10 }], 60)).toBe(10);
  });

  it("мусорные значения пропускаются", () => {
    expect(
      sumSelectionSeconds(
        [
          { start: NaN, end: 10 },
          { start: 0, end: 5 },
        ],
        60,
      ),
    ).toBe(5);
  });

  it("пересечения считаются дважды (честная сумма без merge)", () => {
    expect(
      sumSelectionSeconds(
        [
          { start: 0, end: 10 },
          { start: 5, end: 15 },
        ],
        60,
      ),
    ).toBe(20);
  });
});

describe("pairInOutRanges", () => {
  it("пары по порядку якорей, хрон в обе стороны", () => {
    const { pairs, spanById } = pairInOutRanges([
      { marker_id: "o1", kind: "out", anchor_sec: 5 },
      { marker_id: "i1", kind: "in", anchor_sec: 1 },
      { marker_id: "f1", kind: "favorite", anchor_sec: 3 },
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ start: 1, end: 5, inId: "i1", outId: "o1", seconds: 4 });
    expect(spanById.get("i1")).toBe(4);
    expect(spanById.get("o1")).toBe(4);
    expect(spanById.has("f1")).toBe(false);
  });

  it("одиночки без пары — ни пар, ни хрона", () => {
    const { pairs, spanById } = pairInOutRanges([
      { marker_id: "i1", kind: "in", anchor_sec: 1 },
    ]);
    expect(pairs).toEqual([]);
    expect(spanById.size).toBe(0);
  });

  it("tb_1791346266_38729_2: out забирает ближайший незанятый in (in,in,out)", () => {
    const { pairs, spanById } = pairInOutRanges([
      { marker_id: "i1", kind: "in", anchor_sec: 1 },
      { marker_id: "i2", kind: "in", anchor_sec: 2 },
      { marker_id: "o1", kind: "out", anchor_sec: 9 },
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ start: 2, end: 9, inId: "i2", outId: "o1", seconds: 7 });
    expect(spanById.has("i1")).toBe(false);
  });

  it("in,out,in,out — две последовательные пары", () => {
    const { pairs } = pairInOutRanges([
      { marker_id: "i1", kind: "in", anchor_sec: 1 },
      { marker_id: "o1", kind: "out", anchor_sec: 2 },
      { marker_id: "i2", kind: "in", anchor_sec: 5 },
      { marker_id: "o2", kind: "out", anchor_sec: 6 },
    ]);
    expect(pairs).toHaveLength(2);
    expect(pairs[0]).toMatchObject({ inId: "i1", outId: "o1" });
    expect(pairs[1]).toMatchObject({ inId: "i2", outId: "o2" });
  });

  it("лишние маркеры сверх min — не спариваются", () => {
    const { pairs } = pairInOutRanges([
      { marker_id: "i1", kind: "in", anchor_sec: 1 },
      { marker_id: "i2", kind: "in", anchor_sec: 2 },
      { marker_id: "o1", kind: "out", anchor_sec: 9 },
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].inId).toBe("i2");
  });
});
