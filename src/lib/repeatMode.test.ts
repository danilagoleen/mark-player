import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// tb_1795483282_27036_4 (слово оператора 24.11): повтор one/all — ОДИН луп на два входа
// (меню Loop/Repeat в главном окне и кнопка Repeat в окне Playlist): нажатие в одном месте
// равно нажатию в другом, состояние одно, video.loop выводится из него. Панель — отдельное
// окно Tauri, 'storage' между вебвью не приходит, поэтому режим лежит в localStorage, а смена
// едет событием (как inout-play:changed).
const emit = vi.fn(async (..._args: unknown[]) => undefined);
let registered: { event: string; handler: (e: { payload: unknown }) => void; unlisten: ReturnType<typeof vi.fn> } | null = null;
const listen = vi.fn(async (event: string, handler: (e: { payload: unknown }) => void) => {
  const unlisten = vi.fn();
  registered = { event, handler, unlisten };
  return unlisten;
});
vi.mock("@tauri-apps/api/event", () => ({
  emit: (...args: unknown[]) => emit(...args),
  listen: (event: string, handler: (e: { payload: unknown }) => void) => listen(event, handler),
}));

import { loadPlaybackMode, savePlaybackMode } from "./playlist";
import {
  REPEAT_CHANGED_EVENT,
  cycleRepeatMode,
  listenRepeatChanged,
  nativeLoopFor,
  notifyRepeatChanged,
  parseRepeatEvent,
  repeatOneWindow,
  repeatToastText,
  setRepeatMode,
} from "./repeatMode";

function createLocalStorageMock() {
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
  vi.stubGlobal("localStorage", createLocalStorageMock());
  emit.mockClear();
  listen.mockClear();
  registered = null;
});

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  vi.unstubAllGlobals();
});

describe("parseRepeatEvent", () => {
  it("разбирает {loop: off|all|one}", () => {
    expect(parseRepeatEvent({ loop: "off" })).toBe("off");
    expect(parseRepeatEvent({ loop: "all" })).toBe("all");
    expect(parseRepeatEvent({ loop: "one" })).toBe("one");
  });
  it("мусор — null, а не молчаливый off", () => {
    expect(parseRepeatEvent(null)).toBeNull();
    expect(parseRepeatEvent(undefined)).toBeNull();
    expect(parseRepeatEvent({})).toBeNull();
    expect(parseRepeatEvent({ loop: "twice" })).toBeNull();
    expect(parseRepeatEvent({ loop: true })).toBeNull();
    expect(parseRepeatEvent("one")).toBeNull();
  });
});

describe("repeatToastText: тост Repeat: one | all | off", () => {
  it("по одному слову на режим", () => {
    expect(repeatToastText("one")).toBe("Repeat: one");
    expect(repeatToastText("all")).toBe("Repeat: all");
    expect(repeatToastText("off")).toBe("Repeat: off");
  });
});

describe("cycleRepeatMode / setRepeatMode: одно состояние на оба входа", () => {
  it("цикл off → all → one → off, как кнопка панели раньше", () => {
    expect(loadPlaybackMode().loop).toBe("off");
    expect(cycleRepeatMode()).toBe("all");
    expect(cycleRepeatMode()).toBe("one");
    expect(cycleRepeatMode()).toBe("off");
  });

  it("результат лежит в общем хранилище режима: любой читатель видит то же", () => {
    cycleRepeatMode();
    expect(loadPlaybackMode().loop).toBe("all");
    cycleRepeatMode();
    expect(loadPlaybackMode().loop).toBe("one");
  });

  it("shuffle не трогается повтором", () => {
    savePlaybackMode({ shuffle: true, loop: "off" });
    cycleRepeatMode();
    expect(loadPlaybackMode()).toEqual({ shuffle: true, loop: "all" });
    setRepeatMode("one");
    expect(loadPlaybackMode()).toEqual({ shuffle: true, loop: "one" });
  });

  it("два входа в одну функцию: меню и панель дают одинаковую последовательность", () => {
    const menu: string[] = [];
    const panel: string[] = [];
    // нажимаем «в разных местах» по очереди: каждый шаг идёт от общего состояния, а не от своей копии
    menu.push(cycleRepeatMode()); // меню: off → all
    panel.push(cycleRepeatMode()); // панель: all → one
    menu.push(cycleRepeatMode()); // меню: one → off
    expect([...menu, ...panel]).toEqual(["all", "off", "one"]);
    expect(loadPlaybackMode().loop).toBe("off");
  });

  it("в Tauri смена уходит событием repeat-mode:changed с {loop}", async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    setRepeatMode("one");
    await vi.waitFor(() => expect(emit).toHaveBeenCalledWith(REPEAT_CHANGED_EVENT, { loop: "one" }));
  });

  it("в вебе событие не шлётся: хватает storage", async () => {
    setRepeatMode("all");
    await Promise.resolve();
    expect(emit).not.toHaveBeenCalled();
  });
});

describe("notifyRepeatChanged / listenRepeatChanged (мост между окнами)", () => {
  it("имя события стабильно", () => {
    expect(REPEAT_CHANGED_EVENT).toBe("repeat-mode:changed");
  });
  it("в Tauri подписка отдаёт loop в колбэк, отписка работает", async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    const cb = vi.fn();
    const unlisten = await listenRepeatChanged(cb);
    expect(registered?.event).toBe(REPEAT_CHANGED_EVENT);
    registered?.handler({ payload: { loop: "all" } });
    expect(cb).toHaveBeenCalledWith("all");
    unlisten();
    expect(registered?.unlisten).toHaveBeenCalledTimes(1);
  });
  it("битый payload колбэк не зовёт", async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    const cb = vi.fn();
    await listenRepeatChanged(cb);
    registered?.handler({ payload: { loop: 3 } });
    registered?.handler({ payload: null });
    expect(cb).not.toHaveBeenCalled();
  });
  it("вне Tauri не подписывается, отписка пустая", async () => {
    const unlisten = await listenRepeatChanged(vi.fn());
    expect(listen).not.toHaveBeenCalled();
    expect(() => unlisten()).not.toThrow();
  });
  it("notify вне Tauri — транспорт storage, события нет", async () => {
    expect(await notifyRepeatChanged("one")).toBe("storage");
    expect(emit).not.toHaveBeenCalled();
  });
});

describe("nativeLoopFor: video.loop выводится из общего режима", () => {
  const cases: Array<[string, { mode: "off" | "all" | "one"; scissorsOn: boolean; entryCount: number }, boolean]> = [
    ["off, ножницы выкл", { mode: "off", scissorsOn: false, entryCount: 3 }, false],
    ["off, ножницы вкл", { mode: "off", scissorsOn: true, entryCount: 3 }, false],
    ["one, ножницы выкл: один файл по кругу", { mode: "one", scissorsOn: false, entryCount: 3 }, true],
    ["one, ножницы выкл, плейлиста нет", { mode: "one", scissorsOn: false, entryCount: 0 }, true],
    ["one, ножницы вкл: окно крутит плеер сам", { mode: "one", scissorsOn: true, entryCount: 3 }, false],
    ["all, ножницы выкл, плейлист из многих: по кругу плейлист, не файл", { mode: "all", scissorsOn: false, entryCount: 3 }, false],
    ["all, ножницы выкл, одна запись: файл и есть плейлист", { mode: "all", scissorsOn: false, entryCount: 1 }, true],
    ["all, ножницы выкл, плейлиста нет", { mode: "all", scissorsOn: false, entryCount: 0 }, true],
    ["all, ножницы вкл: круг по отрезкам делает плеер сам", { mode: "all", scissorsOn: true, entryCount: 3 }, false],
  ];
  for (const [name, args, expected] of cases) {
    it(name, () => {
      expect(nativeLoopFor(args)).toBe(expected);
    });
  }
});

describe("repeatOneWindow: что крутит ONE", () => {
  const dur = 600;
  const segs = [
    { start: 10, end: 20 },
    { start: 100, end: 130 },
    { start: 300, end: 310 },
  ];

  it("ножницы выкл: весь файл (один файл по кругу)", () => {
    expect(repeatOneWindow({ scissorsOn: false, segments: segs, playhead: 105, duration: dur })).toEqual({
      start: 0,
      end: dur,
      source: "file",
    });
  });

  it("ножницы вкл, плейхед внутри отрезка: этот отрезок", () => {
    expect(repeatOneWindow({ scissorsOn: true, segments: segs, playhead: 105, duration: dur })).toEqual({
      start: 100,
      end: 130,
      source: "segment",
    });
  });

  it("граница IN входит в отрезок, граница OUT нет (следующий)", () => {
    expect(repeatOneWindow({ scissorsOn: true, segments: segs, playhead: 100, duration: dur }).start).toBe(100);
    expect(repeatOneWindow({ scissorsOn: true, segments: segs, playhead: 130, duration: dur }).start).toBe(300);
  });

  it("в щели берём следующий отрезок (выбор Alpha, слово оператора: «в щели следующий»)", () => {
    expect(repeatOneWindow({ scissorsOn: true, segments: segs, playhead: 50, duration: dur })).toEqual({
      start: 100,
      end: 130,
      source: "segment",
    });
  });

  it("до первого отрезка — первый", () => {
    expect(repeatOneWindow({ scissorsOn: true, segments: segs, playhead: 0, duration: dur }).start).toBe(10);
  });

  it("после последнего отрезка следующего нет — последний, а не весь файл", () => {
    expect(repeatOneWindow({ scissorsOn: true, segments: segs, playhead: 500, duration: dur })).toEqual({
      start: 300,
      end: 310,
      source: "segment",
    });
  });

  it("одна черта вопроса (единственный отрезок): она, где бы ни стоял плейхед", () => {
    const line = [{ start: 40, end: 52 }];
    expect(repeatOneWindow({ scissorsOn: true, segments: line, playhead: 45, duration: dur }).start).toBe(40);
    expect(repeatOneWindow({ scissorsOn: true, segments: line, playhead: 0, duration: dur }).start).toBe(40);
    expect(repeatOneWindow({ scissorsOn: true, segments: line, playhead: 590, duration: dur }).start).toBe(40);
  });

  it("отрезков нет: весь файл", () => {
    expect(repeatOneWindow({ scissorsOn: true, segments: [], playhead: 5, duration: dur })).toEqual({
      start: 0,
      end: dur,
      source: "file",
    });
  });

  it("мусор в плейхеде (NaN) не ломает: первый отрезок", () => {
    expect(repeatOneWindow({ scissorsOn: true, segments: segs, playhead: Number.NaN, duration: dur }).start).toBe(10);
  });
});
