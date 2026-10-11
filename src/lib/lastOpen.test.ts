import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  LAST_OPEN_STORAGE_KEY,
  readLastOpen,
  writeLastOpen,
  clearLastOpen,
  resolveResumeRequest,
} from "./lastOpen";

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

// tb_1791233024_7043_1: Resume — последнее видео + позиция при старте.
describe("readLastOpen/writeLastOpen", () => {
  it("ключ стабилен", () => {
    expect(LAST_OPEN_STORAGE_KEY).toBe("vetka_player_lab_last_open_v1");
  });

  it("холодный старт без записи — null (пустое окно)", () => {
    expect(readLastOpen()).toBeNull();
  });

  it("запись переживает round-trip", () => {
    writeLastOpen("/v/film.mp4", 42.5);
    expect(readLastOpen()).toEqual({ path: "/v/film.mp4", positionSec: 42.5 });
  });

  it("мусор в хранилище даёт null, а не исключение", () => {
    for (const bad of [
      "{bad",
      "[]",
      "42",
      JSON.stringify({ path: "", positionSec: 1 }),
      JSON.stringify({ path: "/v.mp4", positionSec: -3 }),
      JSON.stringify({ path: "/v.mp4", positionSec: NaN }),
      JSON.stringify({ path: "/v.mp4" }),
      JSON.stringify({ positionSec: 5 }),
      JSON.stringify({ path: 42, positionSec: 5 }),
    ]) {
      localStorage.setItem(LAST_OPEN_STORAGE_KEY, bad);
      expect(readLastOpen()).toBeNull();
    }
  });

  it("write не бросает при отказе хранилища (квота/приватный режим)", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {},
    });
    expect(() => writeLastOpen("/v.mp4", 1)).not.toThrow();
    expect(() => clearLastOpen()).not.toThrow();
  });

  it("clear стирает запись", () => {
    writeLastOpen("/v.mp4", 7);
    clearLastOpen();
    expect(readLastOpen()).toBeNull();
  });
});

describe("resolveResumeRequest", () => {
  it("с записью и без явного ?src= — возобновлять", () => {
    const stored = { path: "/v/film.mp4", positionSec: 42.5 };
    expect(resolveResumeRequest("", stored)).toEqual(stored);
  });

  it("явный ?src= побеждает запись", () => {
    const stored = { path: "/v/film.mp4", positionSec: 42.5 };
    expect(resolveResumeRequest("/v/other.mp4", stored)).toBeNull();
  });

  it("без записи — null", () => {
    expect(resolveResumeRequest("", null)).toBeNull();
    expect(resolveResumeRequest("", undefined)).toBeNull();
  });
});
