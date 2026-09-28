import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import tauriConf from "../../src-tauri/tauri.conf.json";
import capabilityDefault from "../../src-tauri/capabilities/default.json";
import {
  DOOR_ENDPOINTS,
  checkModuleDoor,
  doorClickTransition,
  type DoorId,
} from "./moduleDoors";

// Шаг 4/7: ModuleDoor. Двери = достижимость точек бэкенда player-lab
// (probe / export-media / accurate-fps). Сервер может отсутствовать —
// клик по missing фиксирует downloading и запускает перепроверку
// (скачивание+автостарт выполняет внешний раннер, дверь его обнаруживает).

function okResponse(status = 200): Response {
  return { ok: status >= 200 && status < 300, status } as Response;
}

describe("DOOR_ENDPOINTS", () => {
  it("три точки бэкенда висят на API base [signal: двери модулей] [project: cut-player]", () => {
    const ids = Object.keys(DOOR_ENDPOINTS).sort();
    expect(ids).toEqual(["accurate-fps", "export-media", "probe"]);
    expect(DOOR_ENDPOINTS.probe).toBe("/player/probe");
    expect(DOOR_ENDPOINTS["export-media"]).toBe("/player/export-media");
    expect(DOOR_ENDPOINTS["accurate-fps"]).toBe("/player/accurate-fps");
  });
});

describe("checkModuleDoor", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("обрыв соединения → missing (сервер не поднят)", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const door = await checkModuleDoor("probe", "http://localhost:8765/api");
    expect(door.status).toBe("missing");
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:8765/api/player/probe",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("любой HTTP-ответ → available (сервер жив, семантику решает вызывающий)", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(okResponse(404));
    const door = await checkModuleDoor("export-media", "http://localhost:8765/api");
    expect(door.status).toBe("available");
    expect(door.detail).toContain("404");
  });

  it("таймаут → error (не missing: узел есть, но не отвечает)", async () => {
    const abortError = new DOMException("signal timed out", "TimeoutError");
    vi.mocked(fetch).mockRejectedValueOnce(abortError);
    const door = await checkModuleDoor("accurate-fps", "http://localhost:8765/api");
    expect(door.status).toBe("error");
  });
});

describe("doorClickTransition", () => {
  const ids: DoorId[] = ["probe", "export-media", "accurate-fps"];

  it("клик по missing → downloading (скачка+автостарт запущены)", () => {
    for (const id of ids) {
      expect(
        doorClickTransition({ id, endpoint: "/x", status: "missing", detail: null }).status,
      ).toBe("downloading");
    }
  });

  it("клик по error → downloading (повторная попытка)", () => {
    expect(
      doorClickTransition({ id: "probe", endpoint: "/x", status: "error", detail: "t/o" }).status,
    ).toBe("downloading");
  });

  it("клик по available/downloading ничего не меняет", () => {
    expect(
      doorClickTransition({ id: "probe", endpoint: "/x", status: "available", detail: null }).status,
    ).toBe("available");
    expect(
      doorClickTransition({ id: "probe", endpoint: "/x", status: "downloading", detail: null }).status,
    ).toBe("downloading");
  });
});

describe("assetProtocol guard (UPD 13, narrowed by Bell №7, внешние диски)", () => {
  it("tauri.conf: asset-протокол включён, scope сужен (открытый ** запрещён)", () => {
    const app = tauriConf.app as unknown as Record<string, unknown>;
    const security = (app.security ?? {}) as Record<string, unknown>;
    const asset = (security.assetProtocol ?? {}) as { enable?: boolean; scope?: unknown };
    expect(asset.enable).toBe(true);
    expect(Array.isArray(asset.scope) && (asset.scope as unknown[]).length > 0).toBe(true);
    for (const entry of asset.scope as unknown[]) {
      expect(entry, "open ** scope leaks the whole disk").not.toBe("**");
    }
    expect(asset.scope).toContain("$HOME/**");
    // Вердикт оператора 2026-09-25: футажи на внешних дисках/флешках.
    expect(asset.scope).toContain("/Volumes/**");
    expect(asset.scope).toContain("$TEMP/**");
  });

  it("capability default: fs-read покрывает те же три зоны (sidecar с флешки)", () => {
    const allowRead = (capabilityDefault.permissions as unknown[]).find(
      (p) => typeof p === "object" && p !== null && (p as { identifier?: string }).identifier === "fs:allow-read-text-file",
    ) as { allow?: { path?: string }[] } | undefined;
    const paths = (allowRead?.allow ?? []).map((a) => a.path);
    expect(paths).toContain("$HOME/**");
    expect(paths).toContain("/Volumes/**");
    expect(paths).toContain("$TEMP/**");
  });
});
