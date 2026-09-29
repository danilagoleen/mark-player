import { describe, expect, it } from "vitest";
import {
  clampSampleBytes,
  computeContentHash,
  CONTENT_HASH_SAMPLE_BYTES,
  formatShortHash,
  parseContentHash,
  sampleBlob,
} from "./contentHash";

// size=3, head=[1,2,3], tail=[4,5]: SHA-256("ch1|" + LE64(3) + head + tail),
// посчитано независимым python-hashlib.
const KNOWN_VECTOR = "ch1:1366f3a69e0e950887ac7bd1d30fb91dc3b03d976f302c39da11428fbe708089";

describe("computeContentHash (0.22 content-hash identity)", () => {
  it("совпадает с независимым вектором", async () => {
    await expect(
      computeContentHash(3, new Uint8Array([1, 2, 3]), new Uint8Array([4, 5])),
    ).resolves.toBe(KNOWN_VECTOR);
  });

  it("детерминирован и с префиксом версии", async () => {
    const head = new Uint8Array([9, 9, 9]);
    const tail = new Uint8Array([1]);
    const a = await computeContentHash(100, head, tail);
    const b = await computeContentHash(100, head, tail);
    expect(a).toBe(b);
    expect(a?.startsWith("ch1:")).toBe(true);
    expect(a).toHaveLength(4 + 64);
  });

  it("лавина: размер/голова/хвост меняют хеш", async () => {
    const base = await computeContentHash(10, new Uint8Array([1]), new Uint8Array([2]));
    await expect(computeContentHash(11, new Uint8Array([1]), new Uint8Array([2]))).resolves.not.toBe(base);
    await expect(computeContentHash(10, new Uint8Array([9]), new Uint8Array([2]))).resolves.not.toBe(base);
    await expect(computeContentHash(10, new Uint8Array([1]), new Uint8Array([9]))).resolves.not.toBe(base);
  });

  it("пустой файл хешируется, не падает", async () => {
    const h = await computeContentHash(0, new Uint8Array([]), new Uint8Array([]));
    expect(parseContentHash(h)).not.toBeNull();
  });
});

describe("parseContentHash", () => {
  it("разбирает валидный хеш", () => {
    expect(parseContentHash(KNOWN_VECTOR)).toEqual({
      version: "ch1",
      digest: KNOWN_VECTOR.slice(4),
    });
  });

  it("отвергает мусор", () => {
    expect(parseContentHash(null)).toBeNull();
    expect(parseContentHash(undefined)).toBeNull();
    expect(parseContentHash("")).toBeNull();
    expect(parseContentHash("no-colon-here")).toBeNull();
    expect(parseContentHash("ch1:zzz")).toBeNull();
    expect(parseContentHash("ch1:1366f3a6")).toBeNull();
  });
});

describe("formatShortHash", () => {
  it("сжимает до ch1:9f2a…c41d", () => {
    expect(formatShortHash(KNOWN_VECTOR)).toBe("ch1:1366…8089");
  });

  it("пусто и мусор — честно", () => {
    expect(formatShortHash(null)).toBe("");
    expect(formatShortHash("abc")).toBe("abc");
  });
});

describe("clampSampleBytes", () => {
  it("режет границы", () => {
    expect(clampSampleBytes(undefined)).toBe(CONTENT_HASH_SAMPLE_BYTES);
    expect(clampSampleBytes(0)).toBe(1);
    expect(clampSampleBytes(-5)).toBe(1);
    expect(clampSampleBytes(1 << 30)).toBe(1 << 20);
    expect(clampSampleBytes(1234)).toBe(1234);
  });
});

describe("sampleBlob", () => {
  it("берёт голову и хвост без чтения середины", async () => {
    const bytes = new Uint8Array(200);
    for (let i = 0; i < 200; i++) bytes[i] = i;
    const blob = new Blob([bytes]);
    const s = await sampleBlob(blob, 10);
    expect(s.size).toBe(200);
    expect([...s.head]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect([...s.tail]).toEqual([190, 191, 192, 193, 194, 195, 196, 197, 198, 199]);
  });

  it("маленький файл: голова и хвост перекрываются, размер честный", async () => {
    const s = await sampleBlob(new Blob([new Uint8Array([7, 8])]), 64 * 1024);
    expect(s.size).toBe(2);
    expect([...s.head]).toEqual([7, 8]);
    expect([...s.tail]).toEqual([7, 8]);
  });
});
