// tb_1791143015_70644_7 — In/Out-playback ОДНОГО видео.
//
// Скоуп по поправке Commander 06.10 (решение оператора 04.10, §8.2–8.3):
// мультивидео-плейлист с рабочими In/Out — это CUT Player; здесь только
// сегменты текущего видео, PlaylistEntry/addEntryIfAbsent НЕ трогаем.
// Семантика пар — Premiere: одинокий IN = до конца файла, одинокий OUT =
// от начала; вложенность запрещена на уровне создания (wouldNestInPair);
// прыжки — только при пересечении OUT во время проигрывания (скраб
// свободный, старт всегда с плейхеда).

export interface PlaybackSegment {
  start: number;
  end: number;
}

/** Порог «это скраб, а не проигрывание» между соседними timeupdate, сек. */
export const SKIP_SCRUB_THRESHOLD_SEC = 1.5;

/**
 * tb_1791843935_63972_2: ручной сик — навигация, а не проигрывание.
 * OUT-переход срабатывал на жестах навигации (cmd-стрелки, покадровый
 * скролл, shift-шаги, клик по строке комментария): мелкий шаг ≤1.5с через
 * OUT во время play App считал пересечением и уносил плейхед — найти или
 * поставить момент было невозможно. Лекарство: каждый ручной сик метится
 * (markManualSeek), OUT-переход в окне MANUAL_SEEK_SUPPRESS_MS после метки
 * не срабатывает. Естественное проигрывание меток не ставит — ножницы
 * целы. inOutPrevTRef при этом продолжает обновляться, ретро-рывка нет.
 */
export const MANUAL_SEEK_SUPPRESS_MS = 800;

let lastManualSeekAt = Number.NEGATIVE_INFINITY;

/** Отметить ручной сик (жест навигации). now инжектится для тестов. */
export function markManualSeek(now: number = Date.now()): void {
  lastManualSeekAt = now;
}

/** Внутри ли окна подавления после ручного сика. */
export function isManualSeekSuppressed(now: number = Date.now()): boolean {
  return now - lastManualSeekAt < MANUAL_SEEK_SUPPRESS_MS;
}

/** Тумблер In–Out Play, ON по умолчанию. */
export const INOUT_PLAY_STORAGE_KEY = "vetka_player_lab_inout_play_v1";

/** Флаг played-through на файл: сегменты активны после первого полного проигрывания. */
export const PLAYED_THROUGH_STORAGE_KEY = "vetka_player_lab_played_through_v1";

/**
 * Сегменты из in/out-якорей: sequential pairing (как Premiere, как Review
 * Notes и XMEML-экспорт — tb_1791346266_38729_2): out забирает ближайший
 * незанятый in перед собой; одиночки по-премьеровски (OUT без in — от
 * начала, IN без out — до конца). Вырожденное отбрасывается. Сортировка
 * по старту.
 */
export function buildPlaybackSegments(ins: number[], outs: number[], duration: number): PlaybackSegment[] {
  const dur = Number(duration || 0);
  const sortedIns = [...ins]
    .map(Number)
    .filter((v) => Number.isFinite(v) && v >= 0)
    .sort((a, b) => a - b);
  const sortedOuts = [...outs]
    .map(Number)
    .filter((v) => Number.isFinite(v) && v >= 0)
    .sort((a, b) => a - b);
  const events: { t: number; kind: "in" | "out" }[] = [
    ...sortedIns.map((t) => ({ t, kind: "in" as const })),
    ...sortedOuts.map((t) => ({ t, kind: "out" as const })),
  ].sort((a, b) => a.t - b.t || (a.kind === "in" ? -1 : 1));
  const segments: PlaybackSegment[] = [];
  const open: number[] = [];
  for (const e of events) {
    if (e.kind === "in") {
      open.push(e.t);
      continue;
    }
    const match = open.pop();
    if (match === undefined) {
      // Одинокий OUT: от начала файла.
      segments.push({ start: 0, end: e.t });
    } else {
      segments.push({ start: match, end: e.t });
    }
  }
  // Одинокий IN (незакрытые in): до конца файла.
  for (const t of open) {
    segments.push({ start: t, end: dur > 0 ? dur : Number.POSITIVE_INFINITY });
  }
  return segments
    .map((s) => ({
      start: s.start,
      end: dur > 0 ? Math.min(s.end, dur) : s.end,
    }))
    .filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start)
    .sort((a, b) => a.start - b.start);
}

/**
 * Пересечён ли какой-то OUT между prevT и t во время проигрывания.
 * Вернёт старт следующего сегмента (первый старт > t) либо null:
 * нет пересечения / скраб (большой скачок) / последний сегмент
 * (доигрывает до конца; при loop one App сам зацикливает через didCrossOut).
 */
export function resolveSkipTarget(
  segments: PlaybackSegment[],
  prevT: number,
  t: number,
): number | null {
  if (!isPlaybackStep(segments, prevT, t)) return null;
  if (!didCrossOut(segments, prevT, t)) return null;
  const next = segments.find((s) => s.start > t);
  return next ? next.start : null;
}

/** Шаг пригоден для детекта пересечения: идёт вперёд и это не скраб. */
function isPlaybackStep(segments: PlaybackSegment[], prevT: number, t: number): boolean {
  if (!Array.isArray(segments) || segments.length === 0) return false;
  if (!Number.isFinite(prevT) || !Number.isFinite(t) || t <= prevT) return false;
  return t - prevT <= SKIP_SCRUB_THRESHOLD_SEC;
}

/** Факт пересечения OUT-границы между кадрами (для loop one). */
export function didCrossOut(segments: PlaybackSegment[], prevT: number, t: number): boolean {
  if (!isPlaybackStep(segments, prevT, t)) return false;
  return segments.some((s) => prevT < s.end && s.end <= t);
}

/**
 * tb_1791661175_27409_1: пересечение OUT при выключенном loop — пауза ровно
 * на скобке. Раньше этот кейс никак не обрабатывался (resolveSkipTarget null
 * = игнор) и видео уходило за OUT — а IN при этом работал, т.к. всё до
 * первого IN скипается. Возвращает позицию паузы или null.
 */
export function pauseAtOutOnCross(
  segments: PlaybackSegment[],
  prevT: number,
  t: number,
): number | null {
  if (!isPlaybackStep(segments, prevT, t)) return null;
  let hit: number | null = null;
  for (const s of segments) {
    if (prevT < s.end && s.end <= t && (hit === null || s.end > hit)) hit = s.end;
  }
  return hit;
}

/**
 * tb_1791662784_27409_3: единое решение «пересекли OUT во время
 * проигрывания» для App (черновой монтаж): есть следующий IN того же
 * видео или loop one — jump (seek на at, продолжаем играть); хвост без
 * продолжения при выключенном loop — tail (App пробует автопереход
 * плейлиста, иначе пауза на скобке как в tb_1791661175_27409_1).
 * Иначе null (нет пересечения / скраб). Семантика jump — та же, что у
 * resolveSkipTarget + loop-ветки в App (те же find и первый сегмент).
 */
export type OutCrossAction =
  | { kind: "jump"; at: number }
  | { kind: "tail"; at: number };

export function outCrossAction(
  segments: PlaybackSegment[],
  prevT: number,
  t: number,
  loop: boolean,
): OutCrossAction | null {
  if (!isPlaybackStep(segments, prevT, t)) return null;
  let hit: number | null = null;
  for (const s of segments) {
    if (prevT < s.end && s.end <= t && (hit === null || s.end > hit)) hit = s.end;
  }
  if (hit === null) return null;
  const next = segments.find((s) => s.start > t);
  if (next) return { kind: "jump", at: next.start };
  if (loop && segments.length > 0) return { kind: "jump", at: segments[0].start };
  return { kind: "tail", at: hit };
}

/** Скобка строго внутрь закрытой пары — ставить нельзя. */
export function wouldNestInPair(pairs: { start: number; end: number }[], anchor: number): boolean {
  if (!Array.isArray(pairs) || !Number.isFinite(anchor)) return false;
  return pairs.some((p) => anchor > p.start && anchor < p.end);
}

/** Первая валидная [ скобка для авто-старта (null — стартовать не с чего). */
export function firstInAnchor(inAnchors: number[], duration: number): number | null {
  if (!Array.isArray(inAnchors) || !(duration > 0)) return null;
  let best: number | null = null;
  for (const a of inAnchors) {
    if (typeof a !== "number" || !Number.isFinite(a) || a < 0 || a >= duration) continue;
    if (best === null || a < best) best = a;
  }
  return best;
}

export function readInOutPlayEnabled(): boolean {
  try {
    const raw = localStorage.getItem(INOUT_PLAY_STORAGE_KEY);
    if (raw === null) return true;
    return JSON.parse(raw) !== false;
  } catch {
    return true;
  }
}

export function writeInOutPlayEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(INOUT_PLAY_STORAGE_KEY, JSON.stringify(enabled === true));
  } catch {
    // хранилище недоступно — тумблеру не мешаем
  }
}

export function readPlayedThrough(): Record<string, true> {
  try {
    const raw = localStorage.getItem(PLAYED_THROUGH_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, true> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (value === true) out[key] = true;
    }
    return out;
  } catch {
    return {};
  }
}

export function markPlayedThrough(mediaKey: string): void {
  try {
    if (!mediaKey) return;
    const prev = readPlayedThrough();
    prev[mediaKey] = true;
    localStorage.setItem(PLAYED_THROUGH_STORAGE_KEY, JSON.stringify(prev));
  } catch {
    // ignore — флаг best-effort
  }
}
