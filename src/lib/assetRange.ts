// Шаг 4/7, UPD 13 — Range-верификация БЕЗ своей схемы.
//
// Своей кастомной HTTP-схемы не будет: asset-протокол Tauri (tauri@2,
// protocol-asset, scope в tauri.conf.json) отдаёт 206 с Content-Range
// из коробки. Этот модуль — только зонд-классификатор: шлёт
// `Range: bytes=0-1` и решает, поддерживает ли URL Range-запросы.
// Живой прогон — pilot в Tauri (asset.localhost URL текущего медиа);
// здесь — чистая функция, покрытая стабами.

export const RANGE_PROBE_HEADER = "bytes=0-1";

export interface AssetRangeVerdict {
  supported: boolean;
  status: number | null;
  contentRange: string | null;
}

interface RangeHeaders {
  get(name: string): string | null;
}

interface RangeResponse {
  status: number;
  headers: RangeHeaders;
}

type RangeFetchLike = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<RangeResponse>;

export async function verifyAssetRangeSupport(
  assetUrl: string,
  fetchImpl: RangeFetchLike = fetch as unknown as RangeFetchLike,
): Promise<AssetRangeVerdict> {
  try {
    const response = await fetchImpl(assetUrl, {
      headers: { Range: RANGE_PROBE_HEADER },
    });
    const contentRange = response.headers?.get("content-range") ?? null;
    const supported = response.status === 206 && contentRange !== null;
    return { supported, status: response.status, contentRange };
  } catch {
    return { supported: false, status: null, contentRange: null };
  }
}
