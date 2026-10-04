import { describe, expect, it, vi } from "vitest";
import { checkForUpdatesNow, checkForUpdatesSilent, type UpdateDeps } from "./appUpdater";

function deps(over: Partial<UpdateDeps> = {}): UpdateDeps & { toasts: string[] } {
  const toasts: string[] = [];
  return {
    currentVersion: "0.25.0",
    check: async () => null,
    downloadAndInstall: async () => {},
    relaunch: async () => {},
    toast: (m: string) => { toasts.push(m); },
    toasts,
    ...over,
  };
}

describe("checkForUpdatesNow (ручная проверка: говорит всё)", () => {
  it("нет обновления — тост up to date с версией", async () => {
    const d = deps();
    expect(await checkForUpdatesNow(d)).toBe(false);
    expect(d.toasts).toEqual(["You're up to date (0.25.0)."]);
  });

  it("есть обновление — available → install → restarting → relaunch", async () => {
    const order: string[] = [];
    const d = deps({
      check: async () => ({ version: "0.26.0", currentVersion: "0.25.0" }),
      downloadAndInstall: async (onProgress) => {
        order.push("install");
        onProgress(50, 100);
        onProgress(100, 100);
      },
      relaunch: async () => { order.push("relaunch"); },
    });
    expect(await checkForUpdatesNow(d)).toBe(true);
    expect(order).toEqual(["install", "relaunch"]);
    expect(d.toasts[0]).toContain("0.26.0");
    expect(d.toasts[d.toasts.length - 1]).toContain("Restarting");
  });

  it("сеть легла на check — тост failed, без исключений", async () => {
    const d = deps({ check: async () => { throw new Error("net down"); } });
    expect(await checkForUpdatesNow(d)).toBe(false);
    expect(d.toasts).toEqual(["Update check failed: net down"]);
  });

  it("упала установка — тост failed, relaunch не зовём", async () => {
    const relaunch = vi.fn();
    const d = deps({
      check: async () => ({ version: "0.26.0", currentVersion: "0.25.0" }),
      downloadAndInstall: async () => { throw new Error("sig mismatch"); },
      relaunch,
    });
    expect(await checkForUpdatesNow(d)).toBe(false);
    expect(relaunch).not.toHaveBeenCalled();
    expect(d.toasts[d.toasts.length - 1]).toContain("sig mismatch");
  });
});

describe("checkForUpdatesSilent (старт: тост только если нашлось)", () => {
  it("нет обновления — тихо", async () => {
    const d = deps();
    expect(await checkForUpdatesSilent(d)).toBe(false);
    expect(d.toasts).toEqual([]);
  });

  it("сеть легла — тихо", async () => {
    const d = deps({ check: async () => { throw new Error("net down"); } });
    expect(await checkForUpdatesSilent(d)).toBe(false);
    expect(d.toasts).toEqual([]);
  });

  it("обновление есть — один тост available", async () => {
    const d = deps({ check: async () => ({ version: "0.26.0", currentVersion: "0.25.0" }) });
    expect(await checkForUpdatesSilent(d)).toBe(true);
    expect(d.toasts).toEqual(["Update 0.26.0 available — install via Help → Check for Updates."]);
  });
});
