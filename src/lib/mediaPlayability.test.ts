import { describe, expect, it } from "vitest";
import { mediaExtension, mediaPlayability, mediaRefusalReason } from "./mediaPlayability";

// Open-gate (E2E 2026-09-24): диалог Finder честно серит неиграемое,
// а стартовый open files / drop / плейлист / ?src= пропускали всё в
// <video> → чёрный экран. Единый гейт: отказ только по ИЗВЕСТНО-плохому
// (proxy-контейнеры, заведомо не медиа), остальное — permissive
// (арбитры — <video> + probe-бейдж).

describe("mediaPlayability", () => {
  it("нативные контейнеры → native [signal: open-gate] [project: cut-player]", () => {
    for (const name of ["clip.mp4", "Film.MP4", "movie.mov", "a.m4v", "b.webm", "c.ogv", "d.ogg", "stream.m3u8"]) {
      expect(mediaPlayability(name), name).toBe("native");
    }
  });

  it("картинки → native", () => {
    for (const name of ["shot.png", "photo.JPG", "a.webp", "b.gif", "c.avif", "d.heic"]) {
      expect(mediaPlayability(name), name).toBe("native");
    }
  });

  it("proxy-контейнеры → proxy", () => {
    for (const name of ["film.mkv", "old.avi", "disc.ts", "cam.m2ts", "x.wmv", "y.flv", "z.mpg", "w.3gp", "v.vob"]) {
      expect(mediaPlayability(name), name).toBe("proxy");
    }
  });

  it("заведомо не медиа по MIME → unsupported", () => {
    expect(mediaPlayability("notes.txt", "text/plain")).toBe("unsupported");
    expect(mediaPlayability("doc.pdf", "application/pdf")).toBe("unsupported");
    expect(mediaPlayability("subs.srt", "text/plain")).toBe("unsupported");
  });

  it("MIME video/* и image/* без расширения → native", () => {
    expect(mediaPlayability("blob:http://localhost/uuid", "video/mp4")).toBe("native");
    expect(mediaPlayability("blob:http://localhost/uuid", "image/png")).toBe("native");
  });

  it("неизвестное без подсказок → permissive native (не судим — судят <video>+probe)", () => {
    expect(mediaPlayability("/path/to/VIDEO")).toBe("native");
    expect(mediaPlayability("")).toBe("native");
    expect(mediaPlayability("movie.mp4?token=abc&x=1")).toBe("native");
  });
});

describe("mediaExtension", () => {
  it("достаёт расширение для тостов", () => {
    expect(mediaExtension("film.MKV")).toBe("mkv");
    expect(mediaExtension("movie.mp4?token=1")).toBe("mp4");
    expect(mediaExtension("noext")).toBe("");
  });
});

describe("mediaRefusalReason", () => {
  it("модульный оффер по-английски, без warning-тона (1.2) [signal: en-offer] [project: cut-player]", () => {
    const proxy = mediaRefusalReason("/v/film.mkv", "proxy");
    expect(proxy).toContain("Pro engine");
    expect(proxy).toContain("not opened");
    expect(proxy).not.toMatch(/[а-яА-ЯёЁ]/);
    const unsupported = mediaRefusalReason("notes.txt", "unsupported");
    expect(unsupported).toContain("not media");
    expect(unsupported).not.toMatch(/[а-яА-ЯёЁ]/);
  });
});
