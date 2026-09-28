import { describe, expect, it } from "vitest";
import {
  ABOUT_LEGEND,
  ABOUT_ROADMAP,
  DONATE_USDT_TRC20,
  FEEDBACK_EMAIL,
  FEEDBACK_MAILTO,
  GITHUB_RELEASES_URL,
  GITHUB_REPO_URL,
  SUPPORT_TEXT,
} from "./aboutLinks";

// About/Help: единый источник ссылок — окно About и меню Help не разъедутся.
describe("aboutLinks", () => {
  it("ведёт на репу плеера и её релизы", () => {
    expect(GITHUB_REPO_URL).toBe("https://github.com/danilagoleen/mark-player");
    expect(GITHUB_RELEASES_URL).toBe(`${GITHUB_REPO_URL}/releases`);
  });

  it("фидбэк — подтверждённый email оператора", () => {
    expect(FEEDBACK_EMAIL).toBe("exvideo@gmail.com");
    expect(FEEDBACK_MAILTO.startsWith(`mailto:${FEEDBACK_EMAIL}`)).toBe(true);
  });

  it("донат — USDT TRC20 оператора", () => {
    expect(DONATE_USDT_TRC20).toMatch(/^T[1-9A-HJ-NP-Za-km-z]{33}$/);
  });

  it("строки только EN", () => {
    for (const s of [SUPPORT_TEXT, ABOUT_LEGEND, FEEDBACK_MAILTO, ...ABOUT_ROADMAP]) {
      expect(/[а-яё]/i.test(s)).toBe(false);
    }
  });

  it("легенда — про зачёркнутые кадры Мэрилин", () => {
    expect(ABOUT_LEGEND).toContain("Marilyn");
    expect(ABOUT_LEGEND).toContain("struck out");
  });

  it("roadmap — три продукта с расшифровками", () => {
    expect(ABOUT_ROADMAP).toHaveLength(3);
    expect(ABOUT_ROADMAP.join(" ")).toContain("Visual Enhanced Tree Knowledge Architecture");
    expect(ABOUT_ROADMAP.join(" ")).toContain("Cognitive Unified Timeline");
    expect(ABOUT_ROADMAP.join(" ")).toContain("Task Hierarchy & Agent Latent Attention Memory Unification System");
  });
});
