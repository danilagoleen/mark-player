import { describe, expect, it } from "vitest";
// @ts-ignore: @types/node в проекте нет, рантайм vitest — node, этого хватает.
// Тянуть зависимость ради одного CSS-гейта не стоит.
import { readFileSync } from "node:fs";
// @ts-ignore: см. выше.
import { join } from "node:path";

declare const process: { cwd(): string };

// 0.12 слайс: цифры шкалы крупнее + флажки 1.5× (in/out скобки не трогаем).
// CSS-гейт: размеры шкалы только здесь и зафиксированы, иначе разъедутся.
const css = readFileSync(join(process.cwd(), "src", "index.css"), "utf8");

function block(selector: string): string {
  const m = css.match(new RegExp(`${selector.replace(/[./]/g, "\\$&")}\\s*\\{([^}]*)\\}`));
  if (!m) throw new Error(`no CSS rule for ${selector}`);
  return m[1];
}

describe("scale sizes (0.12: крупнее цифры + маркеры 1.5×)", () => {
  it("tick-label 13px", () => {
    expect(block(".tick-label")).toContain("calc(13px * var(--player-scale, 1))");
  });

  it("флажки 1.5×: бокс 21×18, svg 18×18", () => {
    expect(block(".transport-marker")).toContain("width: 21px");
    expect(block(".transport-marker")).toContain("height: 18px");
    expect(block(".transport-marker svg")).toContain("width: 18px");
    expect(block(".transport-marker svg")).toContain("height: 18px");
  });

  it("полосы под выросли: ruler 22px, lane 20px", () => {
    expect(block(".time-ruler")).toContain("height: 22px");
    expect(block(".marker-lane")).toContain("height: 20px");
  });

  it("in/out скобки НЕ тронуты", () => {
    expect(block(".transport-progress-inout-marker")).toContain("calc(16px * var(--player-scale, 1))");
  });
});
