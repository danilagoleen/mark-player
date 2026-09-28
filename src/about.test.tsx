import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { AboutPanel, copyText } from "./about";
import { DONATE_USDT_TRC20, FEEDBACK_EMAIL, GITHUB_RELEASES_URL, GITHUB_REPO_URL } from "./lib/aboutLinks";

// About-окно: версия + строки-копипасты + roadmap.
describe("AboutPanel", () => {
  it("показывает логотип рядом с заголовком", () => {
    const { container } = render(<AboutPanel version="0.17.0" />);
    const img = container.querySelector('img[alt="Mark Player logo"]');
    expect(img).not.toBeNull();
  });

  it("показывает версию beta, легенду и roadmap", () => {
    const { container } = render(<AboutPanel version="0.17.0" />);
    const text = container.textContent ?? "";
    expect(text).toContain("Mark Player");
    expect(text).toContain("0.17.0 beta");
    expect(text).toContain("VETKA lab");
    expect(text).toContain("Marilyn");
    expect(text).toContain("VETKA — Visual Enhanced Tree Knowledge Architecture");
    expect(text).toContain("THALAMUS");
  });

  it("четыре строки-копипасты: email, репа, релизы, кошелёк", () => {
    const { container } = render(<AboutPanel version="0.17.0" />);
    const text = container.textContent ?? "";
    expect(text).toContain(FEEDBACK_EMAIL);
    expect(text).toContain(GITHUB_REPO_URL);
    expect(text).toContain(GITHUB_RELEASES_URL);
    expect(text).toContain(DONATE_USDT_TRC20);
    const copies = Array.from(container.querySelectorAll("button")).filter(
      (b) => b.textContent === "Copy",
    );
    expect(copies).toHaveLength(4);
  });

  it("copyText пишет текст и подтверждает, без моков navigator", async () => {
    const write = vi.fn(async (_t: string) => {});
    const onDone = vi.fn();
    await copyText("hello", write, onDone);
    expect(write).toHaveBeenCalledWith("hello");
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("copyText молчит при недоступном clipboard", async () => {
    const onDone = vi.fn();
    await copyText("hello", async (_t: string) => { throw new Error("denied"); }, onDone);
    expect(onDone).not.toHaveBeenCalled();
  });
});
