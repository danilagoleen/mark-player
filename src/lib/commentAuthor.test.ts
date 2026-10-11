import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatReplyText,
  isAgentAuthor,
  loadCommentAuthorName,
  normalizeAuthorName,
  normalizeMarkerStatus,
  normalizeReplyTo,
  parseReplyText,
  resolveCommentAuthor,
  saveCommentAuthorName,
} from "./commentAuthor";

// tb_1791583578_64923_1: автор коммента + статус open/done.
// node-окружение без localStorage — in-memory стаб на этот файл.
beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
  });
  return () => { vi.unstubAllGlobals(); };
});

describe("commentAuthor", () => {
  it("normalizeAuthorName чистит и режет", () => {
    expect(normalizeAuthorName("  Danila  ")).toBe("Danila");
    expect(normalizeAuthorName("")).toBe("");
    expect(normalizeAuthorName(null)).toBe("");
    expect(normalizeAuthorName(42)).toBe("");
    expect(normalizeAuthorName("x".repeat(100)).length).toBe(64);
  });

  it("isAgentAuthor отличает agent:<роль>", () => {
    expect(isAgentAuthor("agent:Beta")).toBe(true);
    expect(isAgentAuthor("Danila")).toBe(false);
    expect(isAgentAuthor("agent:")).toBe(false);
    expect(isAgentAuthor("")).toBe(false);
    expect(isAgentAuthor(null)).toBe(false);
  });

  it("normalizeMarkerStatus: только done — done", () => {
    expect(normalizeMarkerStatus("done")).toBe("done");
    expect(normalizeMarkerStatus("open")).toBe("open");
    expect(normalizeMarkerStatus("active")).toBe("open");
    expect(normalizeMarkerStatus(undefined)).toBe("open");
    expect(normalizeMarkerStatus(null)).toBe("open");
  });

  it("resolveCommentAuthor: запомненное > ОС > пусто", () => {
    expect(resolveCommentAuthor("Danila", "danilagulin")).toEqual({ name: "Danila", confirmed: true });
    expect(resolveCommentAuthor("", "danilagulin")).toEqual({ name: "danilagulin", confirmed: false });
    expect(resolveCommentAuthor("", "")).toEqual({ name: "", confirmed: false });
  });

  it("save/load крутятся через LS", () => {
    saveCommentAuthorName("  Danila ");
    expect(loadCommentAuthorName()).toBe("Danila");
    expect(resolveCommentAuthor(loadCommentAuthorName(), "other").confirmed).toBe(true);
  });

  // tb_1791585558_31907_1: reply_to ссылка.
  it("normalizeReplyTo принимает только id без пробелов", () => {
    expect(normalizeReplyTo("q03-c1")).toBe("q03-c1");
    expect(normalizeReplyTo("  ")).toBeUndefined();
    expect(normalizeReplyTo("a b")).toBeUndefined();
    expect(normalizeReplyTo(42)).toBeUndefined();
  });

  it("parseReplyText выделяет ссылку и чистит текст", () => {
    expect(parseReplyText("↳ q03-c1: принято, беру")).toEqual({ replyTo: "q03-c1", text: "принято, беру" });
    expect(parseReplyText("обычный текст")).toEqual({ replyTo: undefined, text: "обычный текст" });
    expect(parseReplyText("↳ без двоеточия")).toEqual({ replyTo: undefined, text: "↳ без двоеточия" });
  });

  it("formatReplyText round-trip", () => {
    expect(parseReplyText(formatReplyText("q03-c1", "принято")).replyTo).toBe("q03-c1");
  });
});
