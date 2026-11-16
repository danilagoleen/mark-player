// tb_1791146301_70644_16: хрон селекшна — сумма in-out сегментов.
//
// Чистая сумма пар {start,end} с клампом под длительность медиа.
// Одиночки (in без out и наоборот) в пары не складываются выше по коду
// (inOutRanges в App) — сюда доходят только полные сегменты, их и считаем.
// Пересекающиеся пары считаются честно дважды (простая сумма, без merge):
// такое бывает только при ручной каше маркеров, молча «чинить» её нельзя.
// played-through (_7) не внедрён — флага неактивности в коде нет,
// поэтому активны все пары; когда _7 приземлится, сюда добавится фильтр.
export interface SelectionRange {
  start: number;
  end: number;
}

export function sumSelectionSeconds(ranges: SelectionRange[], duration: number): number {
  if (!Array.isArray(ranges) || ranges.length === 0) return 0;
  const dur = Number(duration || 0);
  let sum = 0;
  for (const range of ranges) {
    const start = Number(range?.start);
    const end = Number(range?.end);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    const clampedStart = Math.max(0, start);
    const clampedEnd = dur > 0 ? Math.min(end, dur) : end;
    sum += Math.max(0, clampedEnd - clampedStart);
  }
  // Эпсилон против 229.9999999 после клампов.
  return Math.max(0, Number(sum.toFixed(3)));
}

// tb_1791146301_70644_18: спаривание in/out для хрона в строках Comments.
// tb_1791346266_38729_2: sequential pairing (как Premiere и как уже делают
// Review Notes/XMEML-экспорт): out забирает ближайший НЕЗАНЯТЫЙ in перед
// собой. in,in,out → пара (in2,out), in1 — одиночка; позиционная склейка
// (in1,out) больше не крадёт внутреннюю резку. Тот же порядок — в
// buildPlaybackSegments и inOutRanges в App, окна не разъезжаются.
export interface InOutMark {
  marker_id: string;
  kind: string;
  anchor_sec: number;
}

/**
 * tb_1794800630_73214_1 / tb_1794865760_47995_3: слой пары — по ИНСТРУМЕНТУ, не по
 * автору. «bracket» — скобки монтажа (in/out, инструмент выбора видео в монтаж:
 * ставит человек, придут и скобки агента). «line» — черта вопроса агента
 * (qmat_<вопрос>_in/_out): подчёркивает участок опроса, оператор её не двигает.
 */
export type InOutLayer = "bracket" | "line";

export interface InOutPair {
  start: number;
  end: number;
  inId: string;
  outId: string;
  seconds: number;
  layer: InOutLayer;
}

export interface PairOptions {
  /**
   * Префиксы id (qmat_<вопрос>_) вопросов загруженного плейлиста. Задан —
   * черты остальных вопросов (старый плейлист на том же файле) в пары не идут.
   * Не задан (null/undefined) — участвуют все черты.
   */
  knownLinePrefixes?: ReadonlySet<string> | null;
}

const LINE_ID_RE = /^qmat_.+_(in|out)$/;

/**
 * tb_1794800630_73214_1: роль маркера in/out. Черта вопроса — маркер агента
 * qmat_<вопрос>_in/_out, вид которого совпадает с суффиксом id. Комментарии
 * агента (_c0, _whole), скобки монтажа и всё прочее — не черта.
 */
export function isQuestionLineMarker(m: { marker_id?: unknown; kind?: unknown } | null | undefined): boolean {
  if (!m || typeof m.marker_id !== "string") return false;
  const hit = LINE_ID_RE.exec(m.marker_id);
  return hit !== null && hit[1] === m.kind;
}

/** Группа черты: префикс вопроса без суффикса in/out (qmat_<вопрос>_). */
export function lineGroupKey(markerId: string): string {
  if (markerId.endsWith("_in")) return markerId.slice(0, -2);
  if (markerId.endsWith("_out")) return markerId.slice(0, -3);
  return markerId;
}

function pairSequential(events: InOutMark[], layer: InOutLayer): InOutPair[] {
  const sorted = [...events].sort((a, b) => {
    const dt = Number(a.anchor_sec || 0) - Number(b.anchor_sec || 0);
    if (dt !== 0) return dt;
    // На одном якоре in раньше out: пара вырожденная (end<=start),
    // ниже отбросится, а не станет одиночками.
    return a.kind === "in" ? -1 : 1;
  });
  const open: InOutMark[] = [];
  const pairs: InOutPair[] = [];
  for (const e of sorted) {
    if (e.kind === "in") {
      open.push(e);
      continue;
    }
    const match = open.pop();
    if (!match) continue; // одинокий out — не пара (синглы считает движок)
    const start = Number(match.anchor_sec || 0);
    const end = Number(e.anchor_sec || 0);
    if (!(end > start)) continue; // вырожденное — мимо
    pairs.push({
      start,
      end,
      inId: match.marker_id,
      outId: e.marker_id,
      seconds: Math.max(0, Number((end - start).toFixed(3))),
      layer,
    });
  }
  return pairs;
}

/**
 * Два слоя (tb_1794800630_73214_1): скобки монтажа спариваются LIFO между собой,
 * черта вопроса — внутри своей группы (qmat_<вопрос>_), поэтому черты разных
 * вопросов и скобки друг с другом не склеиваются.
 */
export function pairInOutRanges(marks: InOutMark[], opts?: PairOptions): {
  pairs: InOutPair[];
  spanById: Map<string, number>;
} {
  const inout = marks.filter((m) => m.kind === "in" || m.kind === "out");
  const brackets: InOutMark[] = [];
  const lineGroups = new Map<string, InOutMark[]>();
  const known = opts?.knownLinePrefixes ?? null;
  for (const m of inout) {
    if (!isQuestionLineMarker(m)) {
      brackets.push(m);
      continue;
    }
    const key = lineGroupKey(m.marker_id);
    if (known && !known.has(key)) continue;
    const list = lineGroups.get(key);
    if (list) list.push(m);
    else lineGroups.set(key, [m]);
  }
  const pairs: InOutPair[] = pairSequential(brackets, "bracket");
  for (const group of lineGroups.values()) pairs.push(...pairSequential(group, "line"));
  pairs.sort((a, b) => a.start - b.start);
  const spanById = new Map<string, number>();
  for (const pair of pairs) {
    spanById.set(pair.inId, pair.seconds);
    spanById.set(pair.outId, pair.seconds);
  }
  return { pairs, spanById };
}
