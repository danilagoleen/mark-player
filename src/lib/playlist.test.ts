import { describe, expect, it, vi } from "vitest";
import {
  createEmptyPlaylist,
  addEntry,
  addEntryIfAbsent,
  removeEntry,
  moveEntry,
  getNextEntry,
  nextLoopMode,
  loadPlaybackMode,
  savePlaybackMode,
  DEFAULT_PLAYBACK_MODE,
  serializePlaylist,
  deserializePlaylist,
} from "./playlist";

describe("createEmptyPlaylist", () => {
  it("creates a playlist with the given name", () => {
    const pl = createEmptyPlaylist("test");
    expect(pl.name).toBe("test");
    expect(pl.entries).toEqual([]);
    expect(pl.id).toBeTruthy();
    expect(pl.createdAt).toBeTruthy();
  });

  it("creates a playlist with a default name", () => {
    const pl = createEmptyPlaylist();
    expect(pl.name).toBe("New Playlist");
  });
});

describe("addEntry", () => {
  it("appends an entry to the playlist", () => {
    const pl = createEmptyPlaylist();
    const updated = addEntry(pl, { path: "/v.mp4", name: "v.mp4", duration: 10 });
    expect(updated.entries).toHaveLength(1);
    expect(updated.entries[0].path).toBe("/v.mp4");
    expect(updated.entries[0].addedAt).toBeTruthy();
  });

  it("does not mutate the original playlist", () => {
    const pl = createEmptyPlaylist();
    addEntry(pl, { path: "/v.mp4", name: "v.mp4", duration: 10 });
    expect(pl.entries).toHaveLength(0);
  });
});

describe("removeEntry", () => {
  it("removes an entry by path", () => {
    let pl = createEmptyPlaylist();
    pl = addEntry(pl, { path: "/a.mp4", name: "a", duration: 5 });
    pl = addEntry(pl, { path: "/b.mp4", name: "b", duration: 5 });
    const updated = removeEntry(pl, "/a.mp4");
    expect(updated.entries).toHaveLength(1);
    expect(updated.entries[0].path).toBe("/b.mp4");
  });

  it("returns same playlist if path not found", () => {
    const pl = createEmptyPlaylist();
    const updated = removeEntry(pl, "/nonexistent.mp4");
    expect(updated.entries).toHaveLength(0);
  });
});

describe("moveEntry", () => {
  it("moves an entry from one index to another", () => {
    let pl = createEmptyPlaylist();
    pl = addEntry(pl, { path: "/a.mp4", name: "a", duration: 1 });
    pl = addEntry(pl, { path: "/b.mp4", name: "b", duration: 1 });
    pl = addEntry(pl, { path: "/c.mp4", name: "c", duration: 1 });
    const updated = moveEntry(pl, 0, 2);
    expect(updated.entries[0].path).toBe("/b.mp4");
    expect(updated.entries[1].path).toBe("/c.mp4");
    expect(updated.entries[2].path).toBe("/a.mp4");
  });

  it("does nothing if index is out of bounds", () => {
    let pl = createEmptyPlaylist();
    pl = addEntry(pl, { path: "/a.mp4", name: "a", duration: 1 });
    const updated = moveEntry(pl, 0, 5);
    expect(updated.entries).toHaveLength(1);
    expect(updated.entries[0].path).toBe("/a.mp4");
  });

  it("does nothing if fromIndex === toIndex", () => {
    let pl = createEmptyPlaylist();
    pl = addEntry(pl, { path: "/a.mp4", name: "a", duration: 1 });
    pl = addEntry(pl, { path: "/b.mp4", name: "b", duration: 1 });
    const updated = moveEntry(pl, 1, 1);
    expect(updated.entries).toHaveLength(2);
  });
});

describe("getNextEntry", () => {
  it("returns the first entry when currentPath is null", () => {
    let pl = createEmptyPlaylist();
    pl = addEntry(pl, { path: "/a.mp4", name: "a", duration: 1 });
    pl = addEntry(pl, { path: "/b.mp4", name: "b", duration: 1 });
    const next = getNextEntry(pl, null);
    expect(next?.path).toBe("/a.mp4");
  });

  it("returns the next entry in sequence", () => {
    let pl = createEmptyPlaylist();
    pl = addEntry(pl, { path: "/a.mp4", name: "a", duration: 1 });
    pl = addEntry(pl, { path: "/b.mp4", name: "b", duration: 1 });
    const next = getNextEntry(pl, "/a.mp4");
    expect(next?.path).toBe("/b.mp4");
  });

  it("returns null for the last entry", () => {
    let pl = createEmptyPlaylist();
    pl = addEntry(pl, { path: "/a.mp4", name: "a", duration: 1 });
    const next = getNextEntry(pl, "/a.mp4");
    expect(next).toBeNull();
  });

  it("returns null for empty playlist", () => {
    const pl = createEmptyPlaylist();
    expect(getNextEntry(pl, null)).toBeNull();
  });
});

describe("serializePlaylist / deserializePlaylist", () => {
  it("round-trips a playlist", () => {
    let pl = createEmptyPlaylist("test");
    pl = addEntry(pl, { path: "/v.mp4", name: "v", duration: 10 });
    const json = serializePlaylist(pl);
    const restored = deserializePlaylist(json);
    expect(restored).not.toBeNull();
    expect(restored?.name).toBe("test");
    expect(restored?.entries).toHaveLength(1);
    expect(restored?.entries[0].path).toBe("/v.mp4");
  });

  it("returns null for invalid JSON", () => {
    expect(deserializePlaylist("not json")).toBeNull();
  });

  it("returns null for JSON without entries array", () => {
    expect(deserializePlaylist('{"id":"x"}')).toBeNull();
  });
});

describe("addEntryIfAbsent (0.10.24)", () => {
  it("добавляет чужой path", () => {
    const pl = createEmptyPlaylist();
    const updated = addEntryIfAbsent(pl, { path: "/v.mp4", name: "v.mp4", duration: 0 });
    expect(updated.entries).toHaveLength(1);
  });

  it("не плодит дубль при повторном открытии того же path", () => {
    const pl = addEntry(createEmptyPlaylist(), { path: "/v.mp4", name: "v.mp4", duration: 0 });
    const updated = addEntryIfAbsent(pl, { path: "/v.mp4", name: "v.mp4", duration: 0 });
    expect(updated.entries).toHaveLength(1);
    expect(updated).toBe(pl);
  });

  it("игнорирует пустой path", () => {
    const pl = createEmptyPlaylist();
    expect(addEntryIfAbsent(pl, { path: "", name: "", duration: 0 }).entries).toHaveLength(0);
  });
});

describe("playback mode: shuffle / loop (tb_1790284149_1559_11)", () => {
  const three = () => {
    let pl = createEmptyPlaylist();
    for (const p of ["/a.mp4", "/b.mp4", "/c.mp4"]) pl = addEntry(pl, { path: p, name: p, duration: 0 });
    return pl;
  };

  it("nextLoopMode циклит off → all → one → off", () => {
    expect(nextLoopMode("off")).toBe("all");
    expect(nextLoopMode("all")).toBe("one");
    expect(nextLoopMode("one")).toBe("off");
  });

  it("loop all заворачивает с последней на первую, off — останавливается", () => {
    expect(getNextEntry(three(), "/c.mp4", { shuffle: false, loop: "all" })?.path).toBe("/a.mp4");
    expect(getNextEntry(three(), "/c.mp4", { shuffle: false, loop: "off" })).toBeNull();
  });

  it("loop one возвращает ту же запись", () => {
    expect(getNextEntry(three(), "/b.mp4", { shuffle: true, loop: "one" })?.path).toBe("/b.mp4");
  });

  it("shuffle никогда не выбирает текущую", () => {
    const pl = three();
    for (const r of [0, 0.34, 0.5, 0.67, 0.999]) {
      expect(getNextEntry(pl, "/b.mp4", { shuffle: true, loop: "off" }, () => r)?.path).not.toBe("/b.mp4");
    }
  });

  it("shuffle на единственной записи: off → null, all → повтор", () => {
    const pl = addEntry(createEmptyPlaylist(), { path: "/a.mp4", name: "a", duration: 0 });
    expect(getNextEntry(pl, "/a.mp4", { shuffle: true, loop: "off" })).toBeNull();
    expect(getNextEntry(pl, "/a.mp4", { shuffle: true, loop: "all" })?.path).toBe("/a.mp4");
  });

  it("режим переживает save/load, мусор в хранилище даёт дефолт", () => {
    // Node 25 кладёт в globalThis нерабочий localStorage поверх jsdom — свой стор в памяти.
    const mem = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
    });
    savePlaybackMode({ shuffle: true, loop: "one" });
    expect(loadPlaybackMode()).toEqual({ shuffle: true, loop: "one" });
    localStorage.setItem("vetka_player_lab_playlist_mode_v1", "{bad");
    expect(loadPlaybackMode()).toEqual(DEFAULT_PLAYBACK_MODE);
    vi.unstubAllGlobals();
  });
});
