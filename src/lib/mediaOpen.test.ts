import { describe, expect, it } from "vitest";
import { isSameMediaPath, resolveMediaContentHash } from "./mediaOpen";

describe("isSameMediaPath (0.10.22 same-file guard)", () => {
  it("возвращает true для того же пути", () => {
    expect(isSameMediaPath("/a/b.mov", "/a/b.mov")).toBe(true);
  });
  it("возвращает false для разных путей", () => {
    expect(isSameMediaPath("/a/b.mov", "/a/c.mov")).toBe(false);
  });
  it("возвращает false когда текущего пути нет", () => {
    expect(isSameMediaPath("/a/b.mov", null)).toBe(false);
    expect(isSameMediaPath("/a/b.mov", undefined)).toBe(false);
  });
  it("возвращает false для пустого входящего пути", () => {
    expect(isSameMediaPath("", "/a/b.mov")).toBe(false);
  });
});

describe("resolveMediaContentHash (0.22 identity)", () => {
  it("пустой таргет — честный null, не бросок", async () => {
    await expect(resolveMediaContentHash({})).resolves.toBeNull();
  });

  it("браузерный File хешируется детерминированно", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "a.mp4");
    const a = await resolveMediaContentHash({ file });
    const b = await resolveMediaContentHash({ file });
    expect(a?.startsWith("ch1:")).toBe(true);
    expect(a).toBe(b);
  });
});
