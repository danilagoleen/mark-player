import { describe, expect, it } from "vitest";
import {
  buildVisualReviewHtml,
  escapeReviewHtml,
  frameToDataUrl,
  resolveSnapshotSize,
  snapshotDirForFile,
  snapshotFileName,
  splitDirName,
} from "./frameSnapshots";

describe("snapshotFileName (0.23 frames at markers)", () => {
  it("таймкод в имя: 00:01:49:18 → 00-01-49-18.jpg", () => {
    expect(snapshotFileName("00:01:49:18")).toBe("00-01-49-18.jpg");
  });

  it("пусто и мусор — честный frame.jpg", () => {
    expect(snapshotFileName(null)).toBe("frame.jpg");
    expect(snapshotFileName(undefined)).toBe("frame.jpg");
    expect(snapshotFileName("")).toBe("frame.jpg");
    expect(snapshotFileName(":::")).toBe("frame.jpg");
  });
});

describe("resolveSnapshotSize", () => {
  it("широкое ужимает до 960 с пропорциями", () => {
    expect(resolveSnapshotSize(1920, 1080)).toEqual({ width: 960, height: 540 });
  });

  it("маленькое не растягивает", () => {
    expect(resolveSnapshotSize(640, 480)).toEqual({ width: 640, height: 480 });
  });

  it("нулевые dims — {0,0}, захват пропустит", () => {
    expect(resolveSnapshotSize(0, 0)).toEqual({ width: 0, height: 0 });
    expect(resolveSnapshotSize(NaN, 1080)).toEqual({ width: 0, height: 0 });
  });
});

describe("frameToDataUrl", () => {
  it("совпадает с эталонным base64", () => {
    // base64([FF D8 FF 00 01 02 03 FF]) посчитан независимым python.
    expect(frameToDataUrl(new Uint8Array([255, 216, 255, 0, 1, 2, 3, 255]))).toBe(
      "data:image/jpeg;base64,/9j/AAECA/8=",
    );
  });

  it("длинный буфер (чанки): длина и границы точные", () => {
    const bytes = new Uint8Array(20000);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
    const url = frameToDataUrl(bytes);
    expect(url.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect(url.length).toBe("data:image/jpeg;base64,".length + 4 * Math.ceil(bytes.length / 3));
    // первые 3 байта 00 01 02 → "AAEC"
    expect(url.slice("data:image/jpeg;base64,".length, "data:image/jpeg;base64,".length + 4)).toBe("AAEC");
  });
});

describe("escapeReviewHtml", () => {
  it("экранирует пользовательский текст", () => {
    expect(escapeReviewHtml('<script>alert("x")</script> & more')).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; more",
    );
    expect(escapeReviewHtml(null)).toBe("");
  });
});

describe("buildVisualReviewHtml", () => {
  const rows = [
    {
      timecode: "00:01:49:18",
      kindLabel: "comment",
      name: "★ Favorite",
      text: "keep <this>",
      fileName: "00-01-49-18.jpg",
      dataUrl: "data:image/jpeg;base64,AAA",
    },
    {
      timecode: "00:02:00:00",
      kindLabel: "comment",
      name: "Comment",
      text: "",
      fileName: null,
      dataUrl: null,
    },
  ];

  it("строки: таймкод, имя, текст, превью и честный no-frame", () => {
    const html = buildVisualReviewHtml({ title: "Review notes — clip", fps: 25, frameCount: 1, markerCount: 2, rows });
    expect(html).toContain("00:01:49:18");
    expect(html).toContain("keep &lt;this&gt;");
    expect(html).toContain('src="data:image/jpeg;base64,AAA"');
    expect(html).toContain("no frame");
    expect(html).toContain("1 frames");
    expect(html).toContain("<title>Review notes — clip</title>");
  });

  it("тайтл экранирован", () => {
    const html = buildVisualReviewHtml({ title: 'a<b"', fps: 25, frameCount: 0, markerCount: 0, rows: [] });
    expect(html).toContain("a&lt;b&quot;");
    expect(html).not.toContain("a<b\"");
  });
});

describe("splitDirName / snapshotDirForFile", () => {
  it("оба сепаратора", () => {
    expect(splitDirName("/a/b/c.html")).toEqual({ dir: "/a/b", base: "c.html" });
    expect(splitDirName("C:\\vids\\c.html")).toEqual({ dir: "C:\\vids", base: "c.html" });
    expect(splitDirName("c.html")).toEqual({ dir: "", base: "c.html" });
  });

  it("папка кадров рядом с файлом", () => {
    expect(snapshotDirForFile("/a/b/clip.review.html", "clip")).toBe("/a/b/clip.review");
    expect(snapshotDirForFile("clip.review.html", "clip")).toBe("clip.review");
  });
});
