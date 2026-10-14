import { describe, expect, it, vi } from "vitest";
import {
  createEmptyPlaylist,
  addEntry,
  addEntryIfAbsent,
  removeEntry,
  moveEntry,
  getNextEntry,
  getNextEntryFromCursor,
  findCurrentEntryIndex,
  nextLoopMode,
  loadPlaybackMode,
  savePlaybackMode,
  DEFAULT_PLAYBACK_MODE,
  trackOpenedFile,
  serializePlaylist,
  deserializePlaylist,
  renamePlaylist,
  sanitizePlaylistFilename,
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

describe("advance by cursor, dup paths (tb_1791865711_84020_5)", () => {
  // Три вопроса на одном видео + следующее: переход с НЕ-первой дублированной
  // записи шёл findIndex-назад (на первую+1) — фантом «возвращает назад».
  const dupes = () => {
    let pl = createEmptyPlaylist();
    pl = addEntry(pl, { path: "/v/a.mp4", name: "a1", duration: 1, question_id: "q1" } as never);
    pl = addEntry(pl, { path: "/v/a.mp4", name: "a2", duration: 1, question_id: "q2" } as never);
    pl = addEntry(pl, { path: "/v/a.mp4", name: "a3", duration: 1, question_id: "q3" } as never);
    pl = addEntry(pl, { path: "/v/b.mp4", name: "b", duration: 1 });
    return pl;
  };
  it("индекс текущей — по вопросу, а не первое вхождение пути", () => {
    const pl = dupes();
    expect(findCurrentEntryIndex(pl.entries, { path: "/v/a.mp4", questionId: "q3" })).toBe(2);
    expect(findCurrentEntryIndex(pl.entries, { path: "/v/a.mp4", questionId: "q1" })).toBe(0);
    expect(findCurrentEntryIndex(pl.entries, { path: "/v/b.mp4" })).toBe(3);
    expect(findCurrentEntryIndex(pl.entries, { path: "/v/no.mp4" })).toBe(-1);
    expect(findCurrentEntryIndex(pl.entries, { path: "/v/a.mp4", questionId: "qx" })).toBe(0);
  });
  it("с третьей дублированной записи — вперёд на /v/b.mp4, а не назад", () => {
    const pl = dupes();
    const found = getNextEntryFromCursor(pl, { path: "/v/a.mp4", questionId: "q3" });
    expect(found?.entry.path).toBe("/v/b.mp4");
    expect(found?.index).toBe(3);
  });
  it("с первой дублированной — на вторую того же видео", () => {
    const pl = dupes();
    const found = getNextEntryFromCursor(pl, { path: "/v/a.mp4", questionId: "q1" });
    expect(found?.entry.path).toBe("/v/a.mp4");
    expect(found?.index).toBe(1);
  });
  it("без вопроса — с первого вхождения (старое поведение)", () => {
    const pl = dupes();
    const found = getNextEntryFromCursor(pl, { path: "/v/a.mp4" });
    expect(found?.index).toBe(1);
  });
  it("getNextEntry без курсора — поведение не изменилось", () => {
    const pl = dupes();
    expect(getNextEntry(pl, "/v/a.mp4")?.path).toBe("/v/a.mp4");
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

// tb_1791143015_70644_10: имя редактируется → идёт в имя файла экспорта.
describe("renamePlaylist", () => {
  it("trims and keeps the name", () => {
    const pl = createEmptyPlaylist("Old");
    expect(renamePlaylist(pl, "  Bell gate v2  ").name).toBe("Bell gate v2");
  });

  it("falls back to default on empty input", () => {
    const pl = createEmptyPlaylist("Old");
    expect(renamePlaylist(pl, "   ").name).toBe("New Playlist");
    expect(renamePlaylist(pl, "").name).toBe("New Playlist");
  });

  it("does not mutate the original", () => {
    const pl = createEmptyPlaylist("Old");
    renamePlaylist(pl, "New");
    expect(pl.name).toBe("Old");
  });
});

describe("sanitizePlaylistFilename", () => {
  it("keeps latin/digits, collapses junk to single underscores", () => {
    expect(sanitizePlaylistFilename("Bell gate v2")).toBe("Bell_gate_v2");
    expect(sanitizePlaylistFilename("Монтаж—финал!")).toBe("playlist");
    expect(sanitizePlaylistFilename("a  b")).toBe("a_b");
    expect(sanitizePlaylistFilename("  cut  ")).toBe("cut");
  });

  it("falls back to playlist on empty/garbage", () => {
    expect(sanitizePlaylistFilename("")).toBe("playlist");
    expect(sanitizePlaylistFilename("   ")).toBe("playlist");
    expect(sanitizePlaylistFilename(null)).toBe("playlist");
    expect(sanitizePlaylistFilename(undefined)).toBe("playlist");
  });
});

describe("trackOpenedFile", () => {
  it("создаёт плейлист с нуля и дописывает в обычный", () => {
    const created = trackOpenedFile(null, { path: "/v/a.mp4", name: "a", duration: 0 });
    expect(created.entries.map((e) => e.path)).toEqual(["/v/a.mp4"]);
    const twice = trackOpenedFile(created, { path: "/v/a.mp4", name: "a", duration: 0 });
    expect(twice.entries).toHaveLength(1);
    const more = trackOpenedFile(created, { path: "/v/b.mp4", name: "b", duration: 0 });
    expect(more.entries.map((e) => e.path)).toEqual(["/v/a.mp4", "/v/b.mp4"]);
  });

  it("не дописывает в плейлист-вопрос (ни по schema, ни по записям)", () => {
    const bySchema = {
      ...createEmptyPlaylist("q"),
      schema: "vetka.cut.question_playlist/1",
      entries: [{ path: "/v/a.mp4", name: "a", duration: 0, addedAt: "x" }],
    };
    expect(trackOpenedFile(bySchema, { path: "/v/b.mp4", name: "b", duration: 0 }).entries).toHaveLength(1);
    const byEntry = {
      ...createEmptyPlaylist("q"),
      entries: [{ path: "/v/a.mp4", name: "a", duration: 0, addedAt: "x", question_id: "q1" }],
    } as unknown as Parameters<typeof trackOpenedFile>[0];
    expect(trackOpenedFile(byEntry, { path: "/v/b.mp4", name: "b", duration: 0 })?.entries).toHaveLength(1);
  });
});

describe("tb_1791876286_57716_1: курсор несёт индекс (сиблинги одного path+qid)", () => {
  const entries = [
    { path: "/v/a.mov", question_id: "q", in_sec: 104.75 },
    { path: "/v/a.mov", question_id: "q", in_sec: 2919.75 },
    { path: "/v/b.mov", question_id: "q2", in_sec: 0 },
  ];
  it("валидный индекс бьёт first-match (курсор на B — индекс B)", () => {
    expect(findCurrentEntryIndex(entries, { path: "/v/a.mov", questionId: "q", index: 1 })).toBe(1);
    expect(findCurrentEntryIndex(entries, { path: "/v/a.mov", questionId: "q", index: 0 })).toBe(0);
  });
  it("протухший индекс (переупорядочили) — fallback на старые правила", () => {
    expect(findCurrentEntryIndex(entries, { path: "/v/a.mov", questionId: "q", index: 9 })).toBe(0);
    expect(findCurrentEntryIndex(entries, { path: "/v/b.mov", questionId: "q2", index: 0 })).toBe(2);
  });
  it("без индекса — как раньше (first-match пары)", () => {
    expect(findCurrentEntryIndex(entries, { path: "/v/a.mov", questionId: "q" })).toBe(0);
  });
  it("getNextEntryFromCursor от B идёт дальше, а не возвращается на B", () => {
    const pl = createEmptyPlaylist("t");
    const full = { ...pl, entries: entries as never };
    const next = getNextEntryFromCursor(full, { path: "/v/a.mov", questionId: "q", index: 1 }, { loop: "off", shuffle: false });
    expect(next?.index).toBe(2);
  });
});
