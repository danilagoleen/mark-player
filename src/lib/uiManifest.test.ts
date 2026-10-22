import { describe, expect, it } from "vitest";
import manifestDoc from "../../docs/AGENT_DATA_MANIFEST.md?raw";
import { buildUIManifest, DATA_MANIFEST_PATH, DATA_SCHEMAS, isUIManifest, type UIManifest } from "./uiManifest";

const API = ["snapshot", "openFile", "addMomentMarker"];

// tb_1791233033_7043_2: манифест агента — как пользоваться плеером без гаданий по DOM.
describe("buildUIManifest", () => {
  it("несёт плеер, версию, контролы и api", () => {
    const manifest = buildUIManifest("0.25.16", API);
    expect(manifest.player).toBe("Mark Player");
    expect(manifest.version).toBe("0.25.16");
    expect(manifest.api).toEqual(API);
    expect(manifest.controls.length).toBeGreaterThan(0);
    for (const control of manifest.controls) {
      expect(typeof control.testid).toBe("string");
      expect(control.testid.length).toBeGreaterThan(0);
      expect(typeof control.label).toBe("string");
      expect(["button", "slider", "input", "zone", "indicator"]).toContain(control.role);
      expect(["always", "video", "conditional"]).toContain(control.when);
    }
  });

  it("ключевые контролы покрыты testid", () => {
    const testids = new Set(buildUIManifest("0.25.16", API).controls.map((c) => c.testid));
    for (const required of [
      "transport-play-pause",
      "transport-progress",
      "transport-mute",
      "transport-volume",
      "seek-backward",
      "seek-forward",
      "viewer-open",
      "marker-favorite",
      "marker-negative",
      "marker-in",
      "marker-out",
      "marker-comment",
      "corner-playlist",
      "context-action",
    ]) {
      expect(testids.has(required)).toBe(true);
    }
  });

  it("дублей testid нет", () => {
    const testids = buildUIManifest("0.25.16", API).controls.map((c) => c.testid);
    expect(new Set(testids).size).toBe(testids.length);
  });

  // tb_1791573274_29299_3: манифест кнопок указывает на манифест данных.
  it("несёт указатель на манифест данных", () => {
    const manifest = buildUIManifest("0.25.16", API);
    expect(manifest.dataManifest).toBe(DATA_MANIFEST_PATH);
    expect(manifest.dataManifest.endsWith("AGENT_DATA_MANIFEST.md")).toBe(true);
    expect(isUIManifest({ ...manifest, dataManifest: "" })).toBe(false);
  });

  // tb_1792547382_5133_1: схемы данных в том же манифесте — один файл вместо двух.
  it("data.schemas: ровно три схемы, указатель на данные сохранён", () => {
    const manifest = buildUIManifest("0.26.0", API);
    expect(manifest.data.manifest).toBe(DATA_MANIFEST_PATH);
    expect(manifest.data.manifestInPlayer.endsWith("docs/AGENT_DATA_MANIFEST.md")).toBe(true);
    expect(manifest.data.schemas).toEqual([...DATA_SCHEMAS]);
    expect(manifest.data.schemas).toEqual([
      "vetka.cut.question_playlist/1",
      "sos_version 0.3",
      "srt-markers",
    ]);
  });

  it("дрейф с AGENT_DATA_MANIFEST: список схем в docs совпадает с манифестом", () => {
    const line = manifestDoc.split("\n").find((row) => row.includes("Схемы данных"));
    expect(line).toBeDefined();
    const inDocs = [...line!.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
    expect(inDocs).toEqual([...DATA_SCHEMAS]);
    for (const schema of DATA_SCHEMAS) expect(manifestDoc).toContain(`\`${schema}\``);
  });
});

describe("isUIManifest", () => {
  it("валидный манифест проходит, мусор — нет", () => {
    const valid: UIManifest = buildUIManifest("0.25.16", API);
    expect(isUIManifest(valid)).toBe(true);
    expect(isUIManifest(null)).toBe(false);
    expect(isUIManifest({})).toBe(false);
    expect(isUIManifest({ ...valid, data: undefined })).toBe(false);
    expect(isUIManifest({ ...valid, data: { ...valid.data, schemas: [] } })).toBe(false);
    expect(isUIManifest({ ...valid, controls: [] })).toBe(false);
    expect(isUIManifest({ ...valid, controls: [{ testid: "", role: "button" }] })).toBe(false);
  });
});
