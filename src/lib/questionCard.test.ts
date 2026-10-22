import { describe, expect, it } from "vitest";
import {
  QUESTION_CARD_MARGIN,
  QUESTION_CARD_POS_KEY,
  clampCardPosition,
  loadCardPosition,
  parseCardPosition,
  saveCardPosition,
} from "./questionCard";

describe("clampCardPosition", () => {
  const bounds = { width: 1000, height: 600 };
  const card = { width: 340, height: 220 };

  it("keeps a position inside the frame", () => {
    expect(clampCardPosition({ x: 200, y: 120 }, bounds, card)).toEqual({ x: 200, y: 120 });
  });

  it("pulls a position back from the right/bottom edges", () => {
    expect(clampCardPosition({ x: 5000, y: 5000 }, bounds, card)).toEqual({
      x: 1000 - 340 - QUESTION_CARD_MARGIN,
      y: 600 - 220 - QUESTION_CARD_MARGIN,
    });
  });

  it("pulls a position back from the left/top edges", () => {
    expect(clampCardPosition({ x: -80, y: -80 }, bounds, card)).toEqual({
      x: QUESTION_CARD_MARGIN,
      y: QUESTION_CARD_MARGIN,
    });
  });

  it("keeps a card bigger than the frame at the margin", () => {
    expect(clampCardPosition({ x: 300, y: 300 }, { width: 200, height: 100 }, card)).toEqual({
      x: QUESTION_CARD_MARGIN,
      y: QUESTION_CARD_MARGIN,
    });
  });

  it("falls back to the margin for non-finite coordinates", () => {
    expect(clampCardPosition({ x: Number.NaN, y: Number.POSITIVE_INFINITY }, bounds, card)).toEqual({
      x: QUESTION_CARD_MARGIN,
      y: QUESTION_CARD_MARGIN,
    });
  });
});

describe("parseCardPosition", () => {
  it("parses a saved point", () => {
    expect(parseCardPosition('{"x":12,"y":34}')).toEqual({ x: 12, y: 34 });
  });

  it("rejects junk and incomplete points", () => {
    expect(parseCardPosition(null)).toBeNull();
    expect(parseCardPosition("")).toBeNull();
    expect(parseCardPosition("not-json")).toBeNull();
    expect(parseCardPosition('{"x":"a","y":2}')).toBeNull();
    expect(parseCardPosition('{"x":1}')).toBeNull();
  });
});

describe("loadCardPosition / saveCardPosition", () => {
  function fakeStorage(initial: Record<string, string> = {}) {
    const data = { ...initial };
    return {
      data,
      getItem: (key: string) => data[key] ?? null,
      setItem: (key: string, value: string) => { data[key] = value; },
    };
  }

  it("round-trips a position under the card key", () => {
    const storage = fakeStorage();
    saveCardPosition({ x: 10.4, y: 20.6 }, storage);
    expect(JSON.parse(storage.data[QUESTION_CARD_POS_KEY])).toEqual({ x: 10, y: 21 });
    expect(loadCardPosition(storage)).toEqual({ x: 10, y: 21 });
  });

  it("survives missing or broken storage", () => {
    expect(loadCardPosition(null)).toBeNull();
    expect(loadCardPosition(fakeStorage({ [QUESTION_CARD_POS_KEY]: "oops" }))).toBeNull();
    expect(() => saveCardPosition({ x: 1, y: 2 }, null)).not.toThrow();
  });
});
