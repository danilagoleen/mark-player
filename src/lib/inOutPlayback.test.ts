import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  buildPlaybackSegments,
  firstInAnchor,
  isManualSeekSuppressed,
  markManualSeek,
  MANUAL_SEEK_SUPPRESS_MS,
  outCrossAction,
  pauseAtOutOnCross,
  questionOutCrossed,
  questionOutDecision,
  repeatOutAction,
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

describe("questionOutCrossed (tb_1791885959_77379_1: out активной записи → advance)", () => {
  const active = { question_id: "trk-02", in_sec: 2828.75, out_sec: 2831.75 };
  it("пересечение out своей записи на своём файле — true", () => {
    expect(questionOutCrossed(active, "/v/big.mov", "/v/big.mov", 2831.5, 2831.75)).toBe(true);
    expect(questionOutCrossed(active, "/v/big.mov", "/v/big.mov", 2831, 2832)).toBe(true);
  });
  it("до out / после out без пересечения — false", () => {
    expect(questionOutCrossed(active, "/v/big.mov", "/v/big.mov", 2829, 2830)).toBe(false);
    expect(questionOutCrossed(active, "/v/big.mov", "/v/big.mov", 2832, 2833)).toBe(false);
  });
  it("чужой файл (карточка не отсюда) — false", () => {
    expect(questionOutCrossed(active, "/v/other.mov", "/v/big.mov", 2831.5, 2831.75)).toBe(false);
  });
  it("нет активной / нет out — false (plain-тракт без изменений)", () => {
    expect(questionOutCrossed(null, "/v/big.mov", "/v/big.mov", 2831.5, 2831.75)).toBe(false);
    expect(questionOutCrossed({ question_id: "q" }, "/v/big.mov", "/v/big.mov", 2831.5, 2831.75)).toBe(false);
    expect(questionOutCrossed({ out_sec: NaN }, "/v/big.mov", "/v/big.mov", 2831.5, 2831.75)).toBe(false);
  });
  it("скраб (>1.5с за тик) — false", () => {
    expect(questionOutCrossed(active, "/v/big.mov", "/v/big.mov", 2800, 2835)).toBe(false);
  });
});

describe("questionOutDecision (tb_1795483216_27036_1: стоп на OUT черты агента, пока оператор не ответил)", () => {
  const line = { question_id: "q1", in_sec: 10, out_sec: 20 };
  const base = {
    scissorsOn: true,
    active: line as { out_sec?: unknown; in_sec?: unknown; question_id?: unknown } | null,
    path: "/v/a.mp4",
    questionPath: "/v/a.mp4",
    prevT: 19.9,
    t: 20.1,
  };
  const unanswered = () => false;
  const answered = () => true;

  it("черта + ножницы ВКЛ + нет ответа: держим на OUT", () => {
    expect(questionOutDecision({ ...base, isAnswered: unanswered })).toBe("hold");
  });
  it("черта + ножницы ВКЛ + есть ответ: идём дальше (advance, как раньше)", () => {
    expect(questionOutDecision({ ...base, isAnswered: answered })).toBe("advance");
  });
  it("ответ ищется по question_id активной черты", () => {
    const seen: string[] = [];
    questionOutDecision({ ...base, isAnswered: (id) => { seen.push(id); return false; } });
    expect(seen).toEqual(["q1"]);
  });
  it("ножницы ВЫКЛ: решения нет ни с ответом, ни без (плейхед идёт спокойно)", () => {
    expect(questionOutDecision({ ...base, scissorsOn: false, isAnswered: unanswered })).toBe("none");
    expect(questionOutDecision({ ...base, scissorsOn: false, isAnswered: answered })).toBe("none");
  });
  it("скобки без черты не держат: активного вопроса нет, или у него нет out", () => {
    expect(questionOutDecision({ ...base, active: null, isAnswered: unanswered })).toBe("none");
    expect(questionOutDecision({ ...base, active: { question_id: "q1", in_sec: 10 }, isAnswered: unanswered })).toBe("none");
    expect(questionOutDecision({ ...base, active: { question_id: "q1", out_sec: NaN }, isAnswered: unanswered })).toBe("none");
  });
  it("чужой файл (карточка не отсюда): не держим", () => {
    expect(questionOutDecision({ ...base, questionPath: "/v/other.mp4", isAnswered: unanswered })).toBe("none");
  });
  it("OUT не пересечён или это скраб (>1.5с за тик): не держим", () => {
    expect(questionOutDecision({ ...base, prevT: 18, t: 18.1, isAnswered: unanswered })).toBe("none");
    expect(questionOutDecision({ ...base, prevT: 21, t: 21.1, isAnswered: unanswered })).toBe("none");
    expect(questionOutDecision({ ...base, prevT: 5, t: 25, isAnswered: unanswered })).toBe("none");
  });
  it("черта без question_id: ответа ждать не по чему, идём дальше как раньше", () => {
    expect(questionOutDecision({ ...base, active: { in_sec: 10, out_sec: 20 }, isAnswered: unanswered })).toBe("advance");
    expect(questionOutDecision({ ...base, active: { question_id: "", in_sec: 10, out_sec: 20 }, isAnswered: unanswered })).toBe("advance");
  });
  it("ответ не вычисляется, пока решать нечего (дорогая выжимка по маркерам)", () => {
    let calls = 0;
    const spy = () => { calls += 1; return false; };
    questionOutDecision({ ...base, scissorsOn: false, isAnswered: spy });
    questionOutDecision({ ...base, prevT: 18, t: 18.1, isAnswered: spy });
    questionOutDecision({ ...base, active: null, isAnswered: spy });
    expect(calls).toBe(0);
  });
});

// tb_1795483282_27036_4 (слово оператора 24.11): повтор one/all на OUT. Раньше тракт скобок
// брал video.loop (его трогало только меню), а режим панели на скобки не влиял: на черте
// агента ONE работал (advance вернул ту же запись), на скобках нет.
describe("repeatOutAction: решение на OUT при повторе", () => {
  const segs = [
    { start: 10, end: 20 },
    { start: 30, end: 40 },
    { start: 50, end: 60 },
  ];

  it("ONE: пересекли OUT среднего отрезка — прыжок на ЕГО начало, не на первый и не на следующий", () => {
    expect(repeatOutAction(segs, 39.9, 40.1, "one", false)).toEqual({ kind: "jump", at: 30 });
  });
  it("ONE: последний отрезок крутится сам в себя, а не уходит в хвост", () => {
    expect(repeatOutAction(segs, 59.9, 60.1, "one", false)).toEqual({ kind: "jump", at: 50 });
    expect(repeatOutAction(segs, 59.9, 60.1, "one", true)).toEqual({ kind: "jump", at: 50 });
  });
  it("ONE: единственный отрезок (одна черта) — на свой IN", () => {
    expect(repeatOutAction([{ start: 40, end: 52 }], 51.9, 52.1, "one", false)).toEqual({ kind: "jump", at: 40 });
  });
  it("ALL: не последний OUT — на следующий IN файла", () => {
    expect(repeatOutAction(segs, 19.9, 20.1, "all", false)).toEqual({ kind: "jump", at: 30 });
  });
  it("ALL: последний OUT, в плейлисте есть куда идти — хвост (App пойдёт на следующую запись, круг замкнёт плейлист)", () => {
    expect(repeatOutAction(segs, 59.9, 60.1, "all", false)).toEqual({ kind: "tail", at: 60 });
  });
  it("ALL: последний OUT, плейлиста нет или одна запись — круг по отрезкам файла", () => {
    expect(repeatOutAction(segs, 59.9, 60.1, "all", true)).toEqual({ kind: "jump", at: 10 });
  });
  it("OFF: как раньше — следующий IN, хвост на последнем OUT", () => {
    expect(repeatOutAction(segs, 19.9, 20.1, "off", false)).toEqual({ kind: "jump", at: 30 });
    expect(repeatOutAction(segs, 59.9, 60.1, "off", false)).toEqual({ kind: "tail", at: 60 });
    expect(repeatOutAction(segs, 59.9, 60.1, "off", true)).toEqual({ kind: "tail", at: 60 });
  });
  it("без пересечения, скраб и пустые сегменты — null на любом режиме", () => {
    for (const mode of ["off", "all", "one"] as const) {
      expect(repeatOutAction(segs, 11, 12, mode, false)).toBeNull();
      expect(repeatOutAction(segs, 5, 45, mode, false)).toBeNull();
      expect(repeatOutAction([], 0, 1, mode, false)).toBeNull();
    }
  });
  it("совместимость: off/all без файлового круга совпадает с outCrossAction(loop=false)", () => {
    expect(repeatOutAction(segs, 19.9, 20.1, "off", false)).toEqual(outCrossAction(segs, 19.9, 20.1, false));
    expect(repeatOutAction(segs, 59.9, 60.1, "all", false)).toEqual(outCrossAction(segs, 59.9, 60.1, false));
    expect(repeatOutAction(segs, 59.9, 60.1, "all", true)).toEqual(outCrossAction(segs, 59.9, 60.1, true));
  });
});

describe("questionOutDecision с повтором (hold не проскакивается)", () => {
  const line = { question_id: "q1", in_sec: 10, out_sec: 20 };
  const base = {
    scissorsOn: true,
    active: line as { out_sec?: unknown; in_sec?: unknown; question_id?: unknown } | null,
    path: "/v/a.mp4",
    questionPath: "/v/a.mp4",
    prevT: 19.9,
    t: 20.1,
  };
  const unanswered = () => false;
  const answered = () => true;

  it("ALL: вопрос без ответа держит и при повторе — круг не уносит плейхед мимо вопроса", () => {
    expect(questionOutDecision({ ...base, loop: "all", isAnswered: unanswered })).toBe("hold");
  });
  it("OFF и без поля loop: как раньше, hold", () => {
    expect(questionOutDecision({ ...base, loop: "off", isAnswered: unanswered })).toBe("hold");
    expect(questionOutDecision({ ...base, isAnswered: unanswered })).toBe("hold");
  });
  it("ONE: повтор одной черты не покидает вопрос, поэтому ждать на OUT незачем — advance (та же запись, назад на IN)", () => {
    expect(questionOutDecision({ ...base, loop: "one", isAnswered: unanswered })).toBe("advance");
    expect(questionOutDecision({ ...base, loop: "one", isAnswered: answered })).toBe("advance");
  });
  it("ONE не придумывает решение там, где его нет: ножницы выкл, чужой файл, нет пересечения — none", () => {
    expect(questionOutDecision({ ...base, loop: "one", scissorsOn: false, isAnswered: unanswered })).toBe("none");
    expect(questionOutDecision({ ...base, loop: "one", questionPath: "/v/other.mp4", isAnswered: unanswered })).toBe("none");
    expect(questionOutDecision({ ...base, loop: "one", prevT: 18, t: 18.1, isAnswered: unanswered })).toBe("none");
  });
  it("ALL с ответом: advance, круг замкнёт плейлист", () => {
    expect(questionOutDecision({ ...base, loop: "all", isAnswered: answered })).toBe("advance");
  });
});
