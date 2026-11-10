import { describe, expect, it } from "vitest";
import pkg from "../../package.json";
import tauriConf from "../../src-tauri/tauri.conf.json";
import cargoToml from "../../src-tauri/Cargo.toml?raw";
import appSrc from "../App.tsx?raw";
import readme from "../../README.md?raw";

// [signal: штамп версии 0.25.3 beta] [project: cut-player]
// Красный→зелёный: все три манифеста несут 0.25.3, титр окна и about-тост —
// Mark Player 0.25.3 beta.
// Без node: импортов (@types/node нет в src-tsconfig): JSON напрямую,
// Cargo.toml и App.tsx — через ?raw (vite/client уже подключён в vite-env.d.ts).

const EXPECTED_VERSION = "0.26.10";
const EXPECTED_DISPLAY = "Mark Player 0.26.10 beta";

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

  it("README top download links carry the stamp (E2E 04.10: stale-branch confusion)", () => {
    expect(readme).toContain(`releases/download/v${EXPECTED_VERSION}/`);
  });

  it("README title + Download filenames carry the stamp", () => {
    expect(readme).toContain(`# Mark Player ${EXPECTED_VERSION} beta`);
    expect(readme).toContain(`Mark.Player_${EXPECTED_VERSION}_`);
  });
});

// tb_1794347727_83767_1 (слово оператора 11.11, скриншот GitHub): раздел «Versioning»
// публичного README называл схему MAJOR.MINOR.PATCH, но тут же звал второе число
// «major line», третье «minor step», считал сотыми и тысячными и перечислял
// внутренние файлы. Читателю нужно одно: что значит 26 и что значит 9.
describe("README: раздел Versioning понятен читателю", () => {
  const start = readme.indexOf("## Versioning");
  const next = readme.indexOf("\n## ", start + 1);
  const section = start >= 0 ? readme.slice(start, next > start ? next : undefined) : "";

  it("раздел есть и не пустой", () => {
    expect(section.length).toBeGreaterThan(80);
  });

  it("без путающих слов: hundredths / thousandths / «major line» / «minor step» / MAJOR.MINOR.PATCH", () => {
    for (const word of ["hundredths", "thousandths", "major line", "minor step", "MAJOR.MINOR.PATCH"]) {
      expect(section.toLowerCase()).not.toContain(word.toLowerCase());
    }
  });

  it("называет пример версии из заголовка и объясняет среднее и последнее число", () => {
    const [major, minor, patch] = EXPECTED_VERSION.split(".");
    expect(section).toContain(`\`${EXPECTED_VERSION}\``);
    expect(section).toContain(`\`${minor}\``);
    expect(section).toContain(`\`${patch}\``);
    expect(section).toMatch(/middle number/i);
    expect(section).toMatch(/last number/i);
    expect(major).toBe("0");
  });

  it("внутренней кухни (имена файлов, appVersion.test.ts) в публичном тексте раздела нет", () => {
    expect(section).not.toContain("appVersion");
    expect(section).not.toContain("tauri.conf");
    expect(section).not.toContain("package.json");
  });
});
