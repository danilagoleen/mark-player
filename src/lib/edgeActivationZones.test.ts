import { describe, expect, it } from "vitest";
// @ts-ignore: @types/node в проекте нет, рантайм vitest — node (как в scaleSizes.test.ts).
import { readFileSync } from "node:fs";
// @ts-ignore: см. выше.
import { join } from "node:path";
import appSrc from "../App.tsx?raw";
import { buildUIManifest } from "./uiManifest";

declare const process: { cwd(): string };

// tb_1795502027_72599_1: слово оператора 24.11. Перемотка по зонам экрана мешала: клик по кадру
// «просто активировать окно плеера и нажать хоткей» перематывал. Решение: боковые зоны (по 34% с
// краёв) ОСТАЮТСЯ, но только под активацию окна: клик по ним не перематывает, не делает play/pause
// и двойным кликом не включает fullscreen. Play/pause по клику остаётся в центре кадра.
// CSS читаем файлом: `?raw` на .css vite отдаёт пустым.
const css = readFileSync(join(process.cwd(), "src", "index.css"), "utf8");

/** Открывающий тег JSX-элемента с data-testid: от ближайшего `<` назад до первого `/>` вперёд. */
function zoneTag(testid: string): string {
  const at = appSrc.indexOf(`data-testid="${testid}"`);
  expect(at, `${testid} not found in App.tsx`).toBeGreaterThan(-1);
  const start = appSrc.lastIndexOf("<", at);
  const end = appSrc.indexOf("/>", at);
  return appSrc.slice(start, end + 2);
}

describe("боковые зоны кадра: только активация окна (0.26.21)", () => {
  it("перемотки по зонам в App.tsx больше нет: ни testid seek-backward/seek-forward, ни aria-label Seek", () => {
    expect(appSrc.includes('data-testid="seek-backward"')).toBe(false);
    expect(appSrc.includes('data-testid="seek-forward"')).toBe(false);
    expect(appSrc.includes('aria-label="Seek backward"')).toBe(false);
    expect(appSrc.includes('aria-label="Seek forward"')).toBe(false);
  });

  it("две зоны activate-zone-left / activate-zone-right: инертные div без обработчиков", () => {
    for (const id of ["activate-zone-left", "activate-zone-right"]) {
      const tag = zoneTag(id);
      expect(tag.startsWith("<div"), `${id} must be a div, not a focusable button`).toBe(true);
      expect(tag.includes("aria-hidden"), `${id} must be aria-hidden`).toBe(true);
      for (const handler of ["onClick", "onDoubleClick", "onMouseDown", "onPointerDown", "onKeyDown", "tabIndex"]) {
        expect(tag.includes(handler), `${id} must not carry ${handler}`).toBe(false);
      }
    }
  });

  it("кнопки-зоны больше не вызывают seekBy; покадровый шаг (меню, хоткеи) остаётся", () => {
    // seekBy зовётся только из покадровых действий меню; зоны его не вызывают.
    expect(/case "frame_step_back":\s*seekBy\(-1\);/.test(appSrc)).toBe(true);
    expect(/case "frame_step_forward":\s*seekBy\(1\);/.test(appSrc)).toBe(true);
    const calls = appSrc.split("seekBy(").length - 1;
    // объявление function seekBy( + два вызова frame_step: ровно три вхождения.
    expect(calls).toBe(3);
  });

  it("CSS: .seek-zone нет, .activate-zone держит прежнюю геометрию (34% с краёв, ниже транспорта)", () => {
    expect(css.includes(".seek-zone")).toBe(false);
    expect(css.includes(".activate-zone-left")).toBe(true);
    expect(css.includes(".activate-zone-right")).toBe(true);
    const base = css.slice(css.indexOf(".activate-zone {"));
    const baseBlock = base.slice(0, base.indexOf("}"));
    expect(baseBlock).toContain("position: absolute");
    expect(baseBlock).toContain("bottom: 104px");
    expect(baseBlock).toContain("width: 34%");
  });

  it("манифест агента без seek-backward/seek-forward и без activate-zone: агенту кликать по ним нечего", () => {
    const testids = buildUIManifest("0.26.21", ["snapshot"]).controls.map((c) => c.testid);
    expect(testids).not.toContain("seek-backward");
    expect(testids).not.toContain("seek-forward");
    expect(testids.some((t) => t.startsWith("activate-zone"))).toBe(false);
  });
});
