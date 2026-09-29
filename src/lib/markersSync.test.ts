import { describe, expect, it } from "vitest";
import { markerBelongsToMedia, resolveExternalMarkers } from "./markersSync";

const ONE = [{ marker_id: "m1", kind: "comment", text: "hello" }];

describe("resolveExternalMarkers (0.10.26 storage-sync)", () => {
  it("применяет валидный массив из LS", () => {
    expect(resolveExternalMarkers(JSON.stringify(ONE))).toEqual(ONE);
  });

  it("игнорирует пустое/отсутствующее значение", () => {
    expect(resolveExternalMarkers(null)).toBeNull();
    expect(resolveExternalMarkers(undefined)).toBeNull();
    expect(resolveExternalMarkers("")).toBeNull();
  });

  it("игнорирует мусор и не-массив", () => {
    expect(resolveExternalMarkers("not json{{")).toBeNull();
    expect(resolveExternalMarkers('{"marker_id":"m1"}')).toBeNull();
    expect(resolveExternalMarkers('"str"')).toBeNull();
  });

  it("игнорирует массив с битыми записями (нет marker_id)", () => {
    expect(resolveExternalMarkers(JSON.stringify([{ kind: "comment" }]))).toBeNull();
    expect(resolveExternalMarkers(JSON.stringify([...ONE, null]))).toBeNull();
  });
});

describe("markerBelongsToMedia (0.22 content-hash identity)", () => {
  const HASH = "ch1:aaaa";
  const OTHER = "ch1:bbbb";

  it("хеш совпал — своё, путь не важен (копия/переименование)", () => {
    expect(
      markerBelongsToMedia({ media_path: "old/name.mp4", content_hash: HASH }, { mediaKey: "copy.mp4", contentHash: HASH }),
    ).toBe(true);
  });

  it("хеш чужой — строго false, даже при том же пути (файл подменили)", () => {
    expect(
      markerBelongsToMedia({ media_path: "a.mp4", content_hash: OTHER }, { mediaKey: "a.mp4", contentHash: HASH }),
    ).toBe(false);
  });

  it("легаси-метка без хеша — fallback на путь", () => {
    expect(markerBelongsToMedia({ media_path: "a.mp4" }, { mediaKey: "a.mp4", contentHash: HASH })).toBe(true);
    expect(markerBelongsToMedia({ media_path: "b.mp4" }, { mediaKey: "a.mp4", contentHash: HASH })).toBe(false);
  });

  it("хеш неизвестен — старое поведение по пути", () => {
    expect(markerBelongsToMedia({ media_path: "a.mp4", content_hash: HASH }, { mediaKey: "a.mp4", contentHash: null })).toBe(true);
    expect(markerBelongsToMedia({ media_path: "b.mp4" }, { mediaKey: "a.mp4", contentHash: null })).toBe(false);
  });

  it("без ключа — false", () => {
    expect(markerBelongsToMedia({ media_path: "a.mp4" }, { mediaKey: null, contentHash: null })).toBe(false);
  });
});
