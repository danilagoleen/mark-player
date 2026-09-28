import { describe, expect, it } from "vitest";
import { RANGE_PROBE_HEADER, verifyAssetRangeSupport } from "./assetRange";

// Шаг 4/7, UPD 13: своей Range-схемы НЕ будет — только верификация того,
// что asset-протокол Tauri отдаёт 206 + Content-Range. Живой прогон —
// pilot в Tauri (fetch convertFileSrc URL с Range); здесь — чистая
// классификация ответа, покрытая стабами.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stubFetch(status: number, contentRange: string | null): any {
  return async () => ({
    status,
    headers: { get: (name: string) => (name.toLowerCase() === "content-range" ? contentRange : null) },
  });
}

describe("verifyAssetRangeSupport", () => {
  it("206 + Content-Range → supported [signal: range-верификация] [project: cut-player]", async () => {
    const result = await verifyAssetRangeSupport(
      "http://asset.localhost/video.mp4",
      stubFetch(206, "bytes 0-1/12345"),
    );
    expect(result).toEqual({ supported: true, status: 206, contentRange: "bytes 0-1/12345" });
  });

  it("200 без Content-Range → не supported (сервер игнорит Range)", async () => {
    const result = await verifyAssetRangeSupport(
      "http://asset.localhost/video.mp4",
      stubFetch(200, null),
    );
    expect(result.supported).toBe(false);
    expect(result.status).toBe(200);
  });

  it("206 без Content-Range → не supported (половинчатый ответ)", async () => {
    const result = await verifyAssetRangeSupport(
      "http://asset.localhost/video.mp4",
      stubFetch(206, null),
    );
    expect(result.supported).toBe(false);
  });

  it("обрыв → supported=false, status=null", async () => {
    const result = await verifyAssetRangeSupport("http://asset.localhost/x.mp4", async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(result).toEqual({ supported: false, status: null, contentRange: null });
  });

  it("зонд шлёт ровно bytes=0-1", async () => {
    let seenHeaders: Record<string, string> | undefined;
    await verifyAssetRangeSupport("http://asset.localhost/x.mp4", (async (
      _url: string,
      init?: { headers?: Record<string, string> },
    ) => {
      seenHeaders = init?.headers;
      return { status: 206, headers: { get: () => "bytes 0-1/10" } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any);
    expect(seenHeaders?.Range ?? seenHeaders?.range).toBe(RANGE_PROBE_HEADER);
  });
});
