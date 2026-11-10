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

// tb_1794351121_83767_3 (слово оператора 11.11, скриншот GitHub): схема версий — внутренняя
// кухня, читателю плеера она не нужна (в 0.26.10 раздел «Versioning» был не убран, а
// переписан другими словами — это была ошибка). Версия видна в заголовке README и в
// ссылках на скачивание; их держат тесты выше. Объяснения номера и перечня файлов
// штампа в публичном тексте быть не должно.
describe("README: внутренней кухни про версии в публичном тексте нет", () => {
  it("раздела Versioning нет", () => {
    expect(readme).not.toMatch(/^#{1,6}\s*Versioning\b/im);
  });

  it("нет объяснения схемы номера: «middle number», «last number», «release line», hundredths", () => {
    for (const word of ["middle number", "last number", "release line", "hundredths", "thousandths", "MAJOR.MINOR.PATCH"]) {
      expect(readme.toLowerCase()).not.toContain(word.toLowerCase());
    }
  });

  it("нет перечня файлов штампа версии и имени проверочного теста", () => {
    for (const word of ["version stamp", "appVersion", "tauri.conf", "package.json", "Cargo.toml"]) {
      expect(readme).not.toContain(word);
    }
  });

  it("версия при этом на месте: заголовок и ссылки на скачивание", () => {
    expect(readme).toContain(`# Mark Player ${EXPECTED_VERSION} beta`);
    expect(readme).toContain(`releases/download/v${EXPECTED_VERSION}/`);
  });
});
