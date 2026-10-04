import { describe, expect, it } from "vitest";
import pkg from "../../package.json";
import tauriConf from "../../src-tauri/tauri.conf.json";
import cargoToml from "../../src-tauri/Cargo.toml?raw";
import appSrc from "../App.tsx?raw";

// [signal: штамп версии 0.25.0 beta] [project: cut-player]
// Красный→зелёный: все три манифеста несут 0.25.0, титр окна и about-тост —
// Mark Player 0.25.0 beta.
// Без node: импортов (@types/node нет в src-tsconfig): JSON напрямую,
// Cargo.toml и App.tsx — через ?raw (vite/client уже подключён в vite-env.d.ts).

const EXPECTED_VERSION = "0.25.0";
const EXPECTED_DISPLAY = "Mark Player 0.25.0 beta";

describe("version stamp 0.17", () => {
  it("package.json carries the stamp", () => {
    expect(pkg.version).toBe(EXPECTED_VERSION);
  });

  it("tauri.conf.json version + window title carry the stamp", () => {
    expect(tauriConf.version).toBe(EXPECTED_VERSION);
    expect(tauriConf.app.windows[0].title).toContain(EXPECTED_DISPLAY);
  });

  it("Cargo.toml carries the stamp", () => {
    expect(cargoToml).toContain(`version = "${EXPECTED_VERSION}"`);
  });

  it("about открывает окно About вместо тоста (About-задача)", () => {
    expect(appSrc).toContain('"panel-about"');
  });
});
