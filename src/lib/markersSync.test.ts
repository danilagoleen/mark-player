import { describe, expect, it } from "vitest";
import { resolveExternalMarkers } from "./markersSync";

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
