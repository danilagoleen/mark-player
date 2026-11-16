// tb_1794846994_51008_1 (А): окно маркеров не должно молчать о скрытом.
//
// Оператор в плейлисте агента ставил ★/✗ клавишами N/F и тулбаром, маркеры
// ложились на шкалу, а окно, открытое иконкой 💬 или клавишей M, стартует с
// фильтром «только комментарии» и показывало лишь ответы карточки. Маркеры
// были, окно о них молчало — оператор решил, что они «не записались».

export interface HintMarker {
  marker_id: string;
  kind: string;
  reply_to?: string;
}

export interface HiddenSummary {
  total: number;
  byKind: Record<string, number>;
  /** «★ 1 · ✗ 2 · ] 1» — по видам в порядке окна; пусто, если скрытого нет */
  text: string;
}

const KIND_ORDER = ["favorite", "negative", "in", "out", "comment", "chat"];
const KIND_GLYPH: Record<string, string> = {
  favorite: "★",
  negative: "✗",
  in: "[",
  out: "]",
  comment: "💬",
  chat: "💬",
};

function kindRank(kind: string): number {
  const i = KIND_ORDER.indexOf(kind);
  return i < 0 ? KIND_ORDER.length : i;
}

/** Что из `all` не попало в `visible` (по marker_id), с разбивкой по видам. */
export function summarizeHiddenByFilter(all: HintMarker[], visible: HintMarker[]): HiddenSummary {
  const shown = new Set(visible.map((m) => m.marker_id));
  const byKind: Record<string, number> = {};
  let total = 0;
  for (const m of all) {
    if (!m || shown.has(m.marker_id)) continue;
    total += 1;
    byKind[m.kind] = (byKind[m.kind] ?? 0) + 1;
  }
  const text = Object.keys(byKind)
    .sort((a, b) => kindRank(a) - kindRank(b))
    .map((kind) => `${KIND_GLYPH[kind] ?? "•"} ${byKind[kind]}`)
    .join(" · ");
  return { total, byKind, text };
}

/**
 * Query окна маркеров при открытии иконкой 💬 / клавишей M.
 * Слово оператора (tb_1791690899_1275_3): без вопросов окно стартует с «только
 * комментарии». Но если на файле лежат маркеры вопроса (qmat_*), оператор
 * отвечает именно ★/✗ — окно открывается со всеми маркерами.
 */
export function commentsPanelFilterQuery(
  initialFilter: "comment" | undefined,
  markers: Array<{ marker_id: string }>,
): string {
  if (initialFilter !== "comment") return "";
  const hasQuestion = markers.some((m) => typeof m?.marker_id === "string" && m.marker_id.startsWith("qmat_"));
  return hasQuestion ? "" : "&filter=comments";
}
