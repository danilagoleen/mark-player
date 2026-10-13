import { describe, expect, it } from "vitest";
import {
  decideMarkersImportTarget,
  readSidecarBinding,
  singlePlaylistMediaPath,
} from "./markersImport";

// tb_1791854416_63972_5: импорт везёт видео — решения чистого модуля.
describe("readSidecarBinding", () => {
  it("SOS-верх: media_path + content_hash", () => {
    expect(readSidecarBinding({ media_path: "/v/a.mp4", content_hash: "ch1:x", markers: [] })).toEqual({
      mediaPath: "/v/a.mp4",
      contentHash: "ch1:x",
    });
  });

  it("голый массив и мусор — без привязки", () => {
    expect(readSidecarBinding([{ kind: "favorite" }])).toEqual({ mediaPath: null, contentHash: null });
    expect(readSidecarBinding(null)).toEqual({ mediaPath: null, contentHash: null });
    expect(readSidecarBinding({ media_path: "  ", content_hash: 42 })).toEqual({ mediaPath: null, contentHash: null });
  });
});

describe("singlePlaylistMediaPath", () => {
  it("25 записей на один mp4 (капча Беты) — этот путь", () => {
    const entries = Array.from({ length: 25 }, (_, i) => ({ path: "/v/c.mp4", question_id: `cal-${i}` }));
    expect(singlePlaylistMediaPath(entries)).toBe("/v/c.mp4");
  });

  it("разные пути — не гадаем", () => {
    expect(singlePlaylistMediaPath([{ path: "/v/a.mp4" }, { path: "/v/b.mp4" }])).toBeNull();
  });

  it("пусто/без путей — null", () => {
    expect(singlePlaylistMediaPath([])).toBeNull();
    expect(singlePlaylistMediaPath([{ name: "x" }])).toBeNull();
    expect(singlePlaylistMediaPath(null)).toBeNull();
  });
});

describe("decideMarkersImportTarget", () => {
  it("привязка + Tauri + видео нет — открыть", () => {
    expect(decideMarkersImportTarget({ mediaPath: "/v/a.mp4", contentHash: null }, null, true)).toEqual({
      mode: "open",
      path: "/v/a.mp4",
    });
  });

  it("привязка + Tauri + открыто другое — открыть (кейс оператора)", () => {
    expect(decideMarkersImportTarget({ mediaPath: "/v/a.mp4", contentHash: null }, "/v/b.mp4", true)).toEqual({
      mode: "open",
      path: "/v/a.mp4",
    });
  });

  it("привязка + Tauri + оно же открыто — цеплять", () => {
    expect(
      decideMarkersImportTarget({ mediaPath: "/v/a.mp4", contentHash: null }, "/v/a.mp4", true),
    ).toEqual({ mode: "attach" });
  });

  it("голый массив + есть видео — цеплять на текущее (редкий кейс цел)", () => {
    expect(decideMarkersImportTarget({ mediaPath: null, contentHash: null }, "/v/b.mp4", true)).toEqual({
      mode: "attach",
    });
  });

  it("голый массив + нет видео — честный need-video", () => {
    expect(decideMarkersImportTarget({ mediaPath: null, contentHash: null }, null, true)).toEqual({
      mode: "need-video",
    });
  });

  it("веб (файлы не открыть): привязка не открывает — цеплять/need-video", () => {
    expect(decideMarkersImportTarget({ mediaPath: "/v/a.mp4", contentHash: null }, "/v/b.mp4", false)).toEqual({
      mode: "attach",
    });
    expect(decideMarkersImportTarget({ mediaPath: "/v/a.mp4", contentHash: null }, null, false)).toEqual({
      mode: "need-video",
    });
  });
});
