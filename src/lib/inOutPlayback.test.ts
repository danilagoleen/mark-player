import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  buildPlaybackSegments,
  firstInAnchor,
  isManualSeekSuppressed,
  markManualSeek,
  MANUAL_SEEK_SUPPRESS_MS,
  outCrossAction,
  pauseAtOutOnCross,
  resolveSkipTarget,
  wouldNestInPair,
  readInOutPlayEnabled,
  writeInOutPlayEnabled,
  readPlayedThrough,
  markPlayedThrough,
  INOUT_PLAY_STORAGE_KEY,
  PLAYED_THROUGH_STORAGE_KEY,
} from "./inOutPlayback";

function lsMock() {
  let store: Record<string, string> = {};
  return {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = String(v);
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (i: number) => Object.keys(store)[i] ?? null,
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", lsMock());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

// tb_1791143015_70644_7: In/Out-playback ОДНОГО видео (поправка Commander:
// мультивидео-плейлист — скоуп CUT, PlaylistEntry не трогать).
describe("buildPlaybackSegments", () => {
  it("пары i-й in + i-й out (разнесённые)", () => {
    expect(buildPlaybackSegments([1, 10], [2, 12], 100)).toEqual([
      { start: 1, end: 2 },
      { start: 10, end: 12 },
    ]);
  });

  it("tb_1791346266_38729_2: in,in,out — внутренняя резка (пара in2+out, in1 одиночка до конца)", () => {
    expect(buildPlaybackSegments([43, 66], [86], 200)).toEqual([
      { start: 43, end: 200 },
      { start: 66, end: 86 },
    ]);
  });

  it("одинокий IN — до конца файла, одинокий OUT — от начала (Premiere)", () => {
    expect(buildPlaybackSegments([8], [], 100)).toEqual([{ start: 8, end: 100 }]);
    expect(buildPlaybackSegments([], [4], 100)).toEqual([{ start: 0, end: 4 }]);
  });

  it("без меток — пусто (режим ревью: играет целиком)", () => {
    expect(buildPlaybackSegments([], [], 100)).toEqual([]);
  });

  it("вырожденное (end<=start, за длительностью) отбрасывается", () => {
    expect(buildPlaybackSegments([5], [5], 100)).toEqual([]);
    expect(buildPlaybackSegments([120], [], 100)).toEqual([]);
  });

  it("сортирует по старту", () => {
    expect(buildPlaybackSegments([10, 1], [12, 2], 100)).toEqual([
      { start: 1, end: 2 },
      { start: 10, end: 12 },
    ]);
  });
});

describe("resolveSkipTarget", () => {
  const segs = [
    { start: 1, end: 2 },
    { start: 3, end: 4 },
  ];

  it("пересечение OUT во время проигрывания — прыжок на следующий сегмент", () => {
    expect(resolveSkipTarget(segs, 1.9, 2.05)).toBe(3);
  });

  it("без пересечения OUT — null (скраб и старт с плейхеда свободны)", () => {
    expect(resolveSkipTarget(segs, 0.1, 0.5)).toBeNull();
    expect(resolveSkipTarget(segs, 1.2, 1.5)).toBeNull();
  });

  it("после последнего OUT — null (дальше решает пауза, см. pauseAtOutOnCross)", () => {
    expect(resolveSkipTarget(segs, 3.9, 4.05)).toBeNull();
  });

  it("большой скачок (скраб) — не пересечение", () => {
    expect(resolveSkipTarget(segs, 0, 3.5)).toBeNull();
  });
});

// tb_1791661175_27409_1: OUT при выключенном loop — пауза ровно на скобке.
describe("pauseAtOutOnCross", () => {
  const segs = [
    { start: 1, end: 2 },
    { start: 3, end: 4 },
  ];

  it("пересечение последнего OUT — позиция паузы", () => {
    expect(pauseAtOutOnCross(segs, 3.9, 4.05)).toBe(4);
  });

  it("пересечение промежуточного OUT — его конец", () => {
    expect(pauseAtOutOnCross(segs, 1.9, 2.05)).toBe(2);
  });

  it("без пересечения и на скрабе — null", () => {
    expect(pauseAtOutOnCross(segs, 1.2, 1.5)).toBeNull();
    expect(pauseAtOutOnCross(segs, 0, 3.5)).toBeNull();
    expect(pauseAtOutOnCross([], 1.2, 1.5)).toBeNull();
  });
});

describe("wouldNestInPair", () => {
  const pairs = [{ start: 1, end: 4 }];

  it("скобка внутрь закрытой пары — запрет", () => {
    expect(wouldNestInPair(pairs, 2)).toBe(true);
  });

  it("границы и внешнее — можно", () => {
    expect(wouldNestInPair(pairs, 1)).toBe(false);
    expect(wouldNestInPair(pairs, 4)).toBe(false);
    expect(wouldNestInPair(pairs, 0.5)).toBe(false);
    expect(wouldNestInPair(pairs, 5)).toBe(false);
    expect(wouldNestInPair([], 2)).toBe(false);
  });
});

describe("firstInAnchor", () => {
  it("берёт минимальную валидную скобку", () => {
    expect(firstInAnchor([30, 10, 20], 100)).toBe(10);
  });
  it("мусор и вне диапазона — мимо, пусто — null", () => {
    expect(firstInAnchor([], 100)).toBeNull();
    expect(firstInAnchor([150], 100)).toBeNull();
    expect(firstInAnchor([-5], 100)).toBeNull();
    expect(firstInAnchor([NaN], 100)).toBeNull();
    expect(firstInAnchor([10], 0)).toBeNull();
    expect(firstInAnchor([10, 200], 100)).toBe(10);
  });
});

describe("stores", () => {
  it("ключи стабильны", () => {
    expect(INOUT_PLAY_STORAGE_KEY).toBe("vetka_player_lab_inout_play_v1");
    expect(PLAYED_THROUGH_STORAGE_KEY).toBe("vetka_player_lab_played_through_v1");
  });

  it("тумблер по умолчанию ON, переживает round-trip", () => {
    expect(readInOutPlayEnabled()).toBe(true);
    writeInOutPlayEnabled(false);
    expect(readInOutPlayEnabled()).toBe(false);
    writeInOutPlayEnabled(true);
    expect(readInOutPlayEnabled()).toBe(true);
  });

  it("played-through: пусто → отметить → есть", () => {
    expect(readPlayedThrough()).toEqual({});
    markPlayedThrough("/v/a.mp4");
    expect(readPlayedThrough()).toEqual({ "/v/a.mp4": true });
  });

  it("мусор и отказ хранилища не бросают", () => {
    localStorage.setItem(INOUT_PLAY_STORAGE_KEY, "{bad");
    expect(readInOutPlayEnabled()).toBe(true);
    localStorage.setItem(PLAYED_THROUGH_STORAGE_KEY, "[1,2]");
    expect(readPlayedThrough()).toEqual({});
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {},
    });
    expect(() => writeInOutPlayEnabled(false)).not.toThrow();
    expect(() => markPlayedThrough("/v/a.mp4")).not.toThrow();
  });
});

describe("outCrossAction (tb_1791662784_27409_3: черновой монтаж)", () => {
  const segs = [
    { start: 10, end: 20 },
    { start: 30, end: 40 },
  ];
  it("нет пересечения — null", () => {
    expect(outCrossAction(segs, 11, 12, false)).toBeNull();
  });
  it("скраб через OUT — null", () => {
    expect(outCrossAction(segs, 10, 35, false)).toBeNull();
  });
  it("пересечение OUT не последнего — jump на следующий IN", () => {
    expect(outCrossAction(segs, 19.9, 20.1, false)).toEqual({ kind: "jump", at: 30 });
  });
  it("пересечение последнего OUT без loop — tail на скобке", () => {
    expect(outCrossAction(segs, 39.9, 40.1, false)).toEqual({ kind: "tail", at: 40 });
  });
  it("пересечение последнего OUT с loop — jump на первый сегмент", () => {
    expect(outCrossAction(segs, 39.9, 40.1, true)).toEqual({ kind: "jump", at: 10 });
  });
  it("пустые сегменты — null", () => {
    expect(outCrossAction([], 0, 1, false)).toBeNull();
  });
});

describe("ручной сик (tb_1791843935_63972_2: навигация без ножниц)", () => {
  it("окно 800мс: внутри подавлено, снаружи свободно", () => {
    expect(MANUAL_SEEK_SUPPRESS_MS).toBe(800);
    markManualSeek(10000);
    expect(isManualSeekSuppressed(10000)).toBe(true);
    expect(isManualSeekSuppressed(10799)).toBe(true);
    expect(isManualSeekSuppressed(10800)).toBe(false);
    expect(isManualSeekSuppressed(20000)).toBe(false);
  });

  it("каждая метка обновляет окно (серия wheel-тиков держит подавление)", () => {
    markManualSeek(10000);
    markManualSeek(10500);
    expect(isManualSeekSuppressed(11299)).toBe(true);
    expect(isManualSeekSuppressed(11300)).toBe(false);
  });

  it("без меток подавления нет (естественное проигрывание — ножницы целы)", () => {
    markManualSeek(0);
    expect(isManualSeekSuppressed(MANUAL_SEEK_SUPPRESS_MS + 1)).toBe(false);
  });
});
