import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// tb_1794846994_51008_1 Б: тумблер ножниц в окне плейлиста писал только в
// localStorage; 'storage' между вебвью Tauri не приходит (tb_1791563210_29299_4),
// главное окно оставалось на ON и прыгало с OUT на следующий IN при показанном OFF.
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

import {
  INOUT_PLAY_CHANGED_EVENT,
  listenInOutPlayChanged,
  notifyInOutPlayChanged,
  parseInOutPlayEvent,
} from "./inOutPlayBridge";

beforeEach(() => {
  emit.mockClear();
  listen.mockClear();
  registered = null;
});

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
});

describe("parseInOutPlayEvent", () => {
  it("разбирает {enabled: boolean}", () => {
    expect(parseInOutPlayEvent({ enabled: false })).toBe(false);
    expect(parseInOutPlayEvent({ enabled: true })).toBe(true);
  });
  it("мусор — null, не молчаливый true", () => {
    expect(parseInOutPlayEvent(null)).toBeNull();
    expect(parseInOutPlayEvent(undefined)).toBeNull();
    expect(parseInOutPlayEvent({})).toBeNull();
    expect(parseInOutPlayEvent({ enabled: "off" })).toBeNull();
    expect(parseInOutPlayEvent("false")).toBeNull();
  });
});

describe("notifyInOutPlayChanged", () => {
  it("в Tauri шлёт событие inout-play:changed с {enabled}", async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    const transport = await notifyInOutPlayChanged(false);
    expect(transport).toBe("tauri");
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(INOUT_PLAY_CHANGED_EVENT, { enabled: false });
  });
  it("в вебе событие не шлётся: там хватает storage", async () => {
    const transport = await notifyInOutPlayChanged(true);
    expect(transport).toBe("storage");
    expect(emit).not.toHaveBeenCalled();
  });
  it("имя события стабильно", () => {
    expect(INOUT_PLAY_CHANGED_EVENT).toBe("inout-play:changed");
  });
});

describe("listenInOutPlayChanged", () => {
  it("в Tauri подписывается и отдаёт enabled в колбэк", async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    const cb = vi.fn();
    const unlisten = await listenInOutPlayChanged(cb);
    expect(listen).toHaveBeenCalledTimes(1);
    expect(registered?.event).toBe(INOUT_PLAY_CHANGED_EVENT);
    registered?.handler({ payload: { enabled: false } });
    expect(cb).toHaveBeenCalledWith(false);
    unlisten();
    expect(registered?.unlisten).toHaveBeenCalledTimes(1);
  });
  it("битый payload колбэк не зовёт", async () => {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    const cb = vi.fn();
    await listenInOutPlayChanged(cb);
    registered?.handler({ payload: { enabled: "x" } });
    registered?.handler({ payload: null });
    expect(cb).not.toHaveBeenCalled();
  });
  it("в вебе не подписывается, возвращает пустую отписку", async () => {
    const cb = vi.fn();
    const unlisten = await listenInOutPlayChanged(cb);
    expect(listen).not.toHaveBeenCalled();
    expect(() => unlisten()).not.toThrow();
  });
});
