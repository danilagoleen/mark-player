// Тултипы в стиле Premiere: «Существительное (Хоткей)».
// Единый источник для title + aria-label кнопок транспорта —
// копии в App разъезжались (Comment (N) при хоткее M).
// Счётчики сюда не класть: счётчик живёт в бейдже иконки.
export type TransportTooltipId =
  | "marker-favorite"
  | "marker-negative"
  | "marker-in"
  | "marker-out"
  | "marker-comment";

export const TRANSPORT_TOOLTIPS: Record<TransportTooltipId, string> = {
  "marker-favorite": "Favorite moment (F)",
  "marker-negative": "Negative moment (N)",
  "marker-in": "Mark in point (I)",
  "marker-out": "Mark out point (O)",
  "marker-comment": "Comment moment (M)",
};

export function tooltipFor(id: TransportTooltipId): string {
  return TRANSPORT_TOOLTIPS[id];
}
