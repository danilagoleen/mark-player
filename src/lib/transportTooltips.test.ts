import { describe, expect, it } from "vitest";
import { TRANSPORT_TOOLTIPS, tooltipFor, type TransportTooltipId } from "./transportTooltips";

// Тултипы в стиле Premiere: «Существительное (Хоткей)», счётчик — в бейдже,
// не в title. Таблица — единый источник для title + aria-label.
describe("TRANSPORT_TOOLTIPS", () => {
  it("каждый тултип — существительное с хоткеем в скобках", () => {
    for (const [id, tip] of Object.entries(TRANSPORT_TOOLTIPS)) {
      expect(tip, id).toMatch(/^.+ \([A-Z←→↑↓⌘⇧]+\)$/);
    }
  });

  it("без счётчиков в title (счётчик живёт в бейдже иконки)", () => {
    for (const [id, tip] of Object.entries(TRANSPORT_TOOLTIPS)) {
      expect(tip, id).not.toMatch(/\(\d+\)/);
    }
  });

  it("пилюля маркеров покрыта целиком: F/N/I/O/M", () => {
    const ids = Object.keys(TRANSPORT_TOOLTIPS) as TransportTooltipId[];
    for (const want of ["marker-favorite", "marker-negative", "marker-in", "marker-out", "marker-comment"] as const) {
      expect(ids).toContain(want);
      expect(tooltipFor(want)).toBe(TRANSPORT_TOOLTIPS[want]);
    }
    expect(tooltipFor("marker-favorite")).toBe("Favorite moment (F)");
    expect(tooltipFor("marker-comment")).toBe("Comment moment (M)");
  });
});
