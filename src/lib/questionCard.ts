// tb_1792634247_72740_2: карточку вопроса оператор двигает за шапку.
// Чистые помощники без DOM: кламп позиции внутри кадра + персист в LS.
// Позиция — левый верхний угол карточки относительно positioned-родителя.
export const QUESTION_CARD_POS_KEY = "vetka.player.question.card.pos.v1";

export const QUESTION_CARD_MARGIN = 4;

export interface CardPoint {
  x: number;
  y: number;
}

export interface CardSize {
  width: number;
  height: number;
}

/** Держит карточку внутри кадра: не даёт уехать за края и потеряться. */
export function clampCardPosition(
  pos: CardPoint,
  bounds: CardSize,
  card: CardSize,
  margin: number = QUESTION_CARD_MARGIN,
): CardPoint {
  const maxX = Math.max(margin, bounds.width - card.width - margin);
  const maxY = Math.max(margin, bounds.height - card.height - margin);
  const x = Number.isFinite(pos.x) ? pos.x : margin;
  const y = Number.isFinite(pos.y) ? pos.y : margin;
  return {
    x: Math.min(Math.max(x, margin), maxX),
    y: Math.min(Math.max(y, margin), maxY),
  };
}

export function parseCardPosition(raw: string | null | undefined): CardPoint | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CardPoint>;
    const x = Number(parsed?.x);
    const y = Number(parsed?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  } catch {
    return null;
  }
}

export function loadCardPosition(
  storage: Pick<Storage, "getItem"> | null | undefined =
    typeof window !== "undefined" ? window.localStorage : null,
): CardPoint | null {
  if (!storage) return null;
  try {
    return parseCardPosition(storage.getItem(QUESTION_CARD_POS_KEY));
  } catch {
    return null;
  }
}

export function saveCardPosition(
  pos: CardPoint,
  storage: Pick<Storage, "setItem"> | null | undefined =
    typeof window !== "undefined" ? window.localStorage : null,
): void {
  if (!storage) return;
  try {
    storage.setItem(QUESTION_CARD_POS_KEY, JSON.stringify({ x: Math.round(pos.x), y: Math.round(pos.y) }));
  } catch {
    // приватный режим / нет storage — позиция живёт до перезагрузки
  }
}
