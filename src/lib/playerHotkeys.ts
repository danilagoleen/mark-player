export type PlayerHotkeyAction =
  | "playPause"
  | "playBack"
  | "stop"
  | "playForward"
  | "frameStepBack"
  | "frameStepForward"
  | "volumeUp"
  | "volumeDown"
  | "proportionalStepBack"
  | "proportionalStepForward"
  | "jumpPrevMarker"
  | "jumpNextMarker"
  | "goToStart"
  | "goToEnd"
  | "markIn"
  | "markOut"
  | "addFavoriteMarker"
  | "addNegativeMarker"
  | "addCommentMarker"
  | "toggleFullscreen"
  | "exitFullscreen"
  | "undo"
  | "redo"
  | "toggleDebug"
  | "cycleQuality"
  | "inOutPlayToggle";

const TYPING_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

// 0.10.29 (Шаг 2.1): key repeat разрешён только стрелкам (кадры/громкость) —
// зажатая стрелка листает непрерывно. Остальное глушится как раньше (0.10.18).
const REPEATABLE_CODES = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]);

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (TYPING_TAGS.has(target.tagName)) return true;
  if (target.closest("[contenteditable='true']")) return true;
  return false;
}

// 0.12: Shift-шаг пропорционально длине (вердикт оператора: хардкод 5с
// убивает короткие видео). 1% длины с клампами: 3с → 0.5с, час → не дальше 5с.
export function resolveProportionalStep(durationSec: number): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 0.5;
  return Math.min(5, Math.max(0.5, durationSec / 100));
}

// Фикс залипания 27.09: чистый селектор соседнего маркера. Эпсилон — чтобы,
// стоя ровно на маркере, прыгать ЧЕРЕЗ него, а не вставать.
export function resolveJumpTarget(anchors: number[], pos: number, dir: -1 | 1): number | undefined {
  const EPS = 0.001;
  const sorted = [...anchors].sort((a, b) => a - b);
  return dir === 1
    ? sorted.find((a) => a > pos + EPS)
    : [...sorted].reverse().find((a) => a < pos - EPS);
}

export function resolvePlayerHotkey(e: KeyboardEvent): PlayerHotkeyAction | null {
  if (e.repeat && !REPEATABLE_CODES.has(e.code)) return null;
  // Typing guard: inputs consume everything except Escape (regression 0.10.18 —
  // isTypingTarget existed but was never wired into the keydown path).
  if (isTypingTarget(e.target)) {
    if (e.code === "Escape" || e.key?.toLowerCase() === "escape") return "exitFullscreen";
    return null;
  }
  if (e.ctrlKey || e.altKey || e.metaKey) {
    if (e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey && e.code === "KeyF") return "toggleFullscreen";
    // 0.20: ⌘Z / Ctrl+Z — undo истории маркеров, с Shift — redo.
    // Typing-guard выше уже отработал: в инпутах остаётся нативный undo.
    // e.repeat глушится общим правилом (KeyZ не в REPEATABLE): зажатый ⌘Z
    // откатывает один шаг, а не всю историю.
    if ((e.metaKey !== e.ctrlKey) && !e.altKey && e.code === "KeyZ") return e.shiftKey ? "redo" : "undo";
    if (e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.code === "KeyI") return "toggleDebug";
    // 0.12: ⌘+←/→ — прыжки к соседним маркерам (стрелки от раскладки не зависят).
    if (e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey && e.code === "ArrowLeft") return "jumpPrevMarker";
    if (e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey && e.code === "ArrowRight") return "jumpNextMarker";
    return null;
  }
  if (e.shiftKey) {
    // 0.12: Shift+←/→ — пропорциональный шаг вместо 5 кадров (вердикт оператора).
    if (e.code === "ArrowLeft") return "proportionalStepBack";
    if (e.code === "ArrowRight") return "proportionalStepForward";
    return null;
  }

  switch (e.code) {
    case "Escape":
      return "exitFullscreen";
    case "Space":
      return "playPause";
    case "KeyJ":
      return "playBack";
    case "KeyK":
      return "stop";
    case "KeyL":
      return "playForward";
    case "ArrowLeft":
      return "frameStepBack";
    case "ArrowRight":
      return "frameStepForward";
    case "ArrowUp":
      return "volumeUp";
    case "ArrowDown":
      return "volumeDown";
    case "Home":
      return "goToStart";
    case "End":
      return "goToEnd";
    case "KeyI":
      return "markIn";
    case "KeyO":
      return "markOut";
    case "KeyF":
      return "addFavoriteMarker";
    case "KeyM":
      return "addCommentMarker";
    case "KeyN":
      return "addNegativeMarker";
    case "KeyQ":
      return "cycleQuality";
    // tb_1791143015_70644_7: S — тумблер In–Out Play (ножницы-плёнка).
    case "KeyS":
      return "inOutPlayToggle";
    default:
      break;
  }
  // Fallback for layouts where e.code is not Key* (e.g. IME, some Tauri webviews,
  // agent synthetic input via dispatchEvent): bare key letter, plus Escape.
  // Bell №8: вердикт оператора — в RU-раскладке маркеры не работали, code там
  // ненадёжен. RU-алиасы по позициям ЙЦУКЕН: а=f ь=m т=n ш=i щ=o.
  const k = e.key?.toLowerCase();
  if (k === "escape") return "exitFullscreen";
  if (k === "f" || k === "а") return "addFavoriteMarker";
  if (k === "m" || k === "ь") return "addCommentMarker";
  if (k === "n" || k === "т") return "addNegativeMarker";
  if (k === "i" || k === "ш") return "markIn";
  if (k === "o" || k === "щ") return "markOut";
  if (k === "s" || k === "ы") return "inOutPlayToggle";
  return null;
}

export interface ShuttleDisplay {
  /** Accessible label for the transport play/pause button. */
  label: string;
  /** True while video moves (playing or shuttling) — HUD hides, button shows Pause. */
  moving: boolean;
  /** Direction+level badge text, or null on stop. */
  badge: string | null;
}

/**
 * Класс слота бейджа ставки (дочерний 0.10.19, E2E 2026-09-24).
 * Слот всегда в DOM под таймкодом (мин-высота в CSS) — появление/
 * исчезновение бейджа не двигает тулбар; модификатор — для тестов и тем.
 */
export function shuttleSlotClass(badge: string | null): string {
  return `transport-shuttle-badge${badge ? " has-badge" : " is-empty"}`;
}

/**
 * tb_1795483235_27036_2 (слово оператора 24.11): лесенка J/L. Первое нажатие
 * даёт медленную ступень 0.5x в обе стороны, чтобы успеть рассмотреть кусок и
 * ответить агенту; дальше 1x, 2x, 3x. Уровень шаттла хранится как знаковая
 * скорость (минус = назад), поэтому бейдж и playbackRate берут его как есть.
 *
 * tb_1795503453_72599_2 (слово оператора 24.11): лесенки по направлениям. Вперёд одна
 * добавочная ступень 0.8x (вечерние передачи и точность склеек), назад лесенка прежняя:
 * тонкая настройка во все стороны не нужна.
 */
export const SHUTTLE_LADDER_FORWARD = [0.5, 0.8, 1, 2, 3] as const;
export const SHUTTLE_LADDER_REVERSE = [0.5, 1, 2, 3] as const;

/**
 * Следующий уровень шаттла по нажатию J (dir = -1) или L (dir = 1).
 * Со стопа и при смене направления начинаем с первой ступени; в своём
 * направлении поднимаемся на ступень выше и упираемся в последнюю. Нештатный
 * уровень (не из лесенки, NaN) не роняет: берём ближайшую ступень выше.
 */
export function nextShuttleLevel(current: number, dir: -1 | 1): number {
  const ladder: readonly number[] = dir === 1 ? SHUTTLE_LADDER_FORWARD : SHUTTLE_LADDER_REVERSE;
  const first = ladder[0];
  const last = ladder[ladder.length - 1];
  const sameDirection = Number.isFinite(current) && current !== 0 && Math.sign(current) === dir;
  if (!sameDirection) return dir * first;
  const magnitude = Math.abs(current);
  const next = ladder.find((rate) => rate > magnitude) ?? last;
  return dir * next;
}

export function getShuttleDisplay(shuttle: number, isPlaying: boolean): ShuttleDisplay {
  if (shuttle < 0) return { label: `Rewind ${-shuttle}x`, moving: true, badge: `◀ ${-shuttle}x` };
  if (shuttle > 0) return { label: `Shuttle ${shuttle}x`, moving: true, badge: `▶ ${shuttle}x` };
  if (isPlaying) return { label: "Pause", moving: true, badge: null };
  return { label: "Play", moving: false, badge: null };
}

/**
 * tb_1795485057_27036_5: один seek в полёте. Раньше J и стрелки ставили
 * currentTime, не дожидаясь seeked (до 20 переходов в секунду): на длинном
 * GOP запросы копились, и после стопа кадр не рисовался до Play. Запрос в
 * полёте не прерываем: пока seeking, новая цель только запоминается (побеждает
 * последняя), по seeked уходит ровно одна последняя. Так последняя
 * запрошенная позиция применяется всегда, а очередь не растёт.
 */
export interface SeekTarget {
  currentTime: number;
  readonly seeking: boolean;
  addEventListener(type: "seeked", listener: () => void): void;
  removeEventListener(type: "seeked", listener: () => void): void;
}

export class SeekCoalescer {
  private pending: number | null = null;

  constructor(private el: SeekTarget) {
    this.el.addEventListener("seeked", this.onSeeked);
  }

  private onSeeked = (): void => {
    if (this.pending === null) return;
    const t = this.pending;
    this.pending = null;
    this.el.currentTime = t;
  };

  /** Запросить позицию: сразу, если seek свободен, иначе запомнить как последнюю. */
  request(t: number): void {
    if (this.el.seeking) {
      this.pending = t;
      return;
    }
    this.pending = null;
    this.el.currentTime = t;
  }

  /** Куда видео придёт: ожидающая цель, иначе текущая позиция. */
  position(): number {
    return this.pending ?? this.el.currentTime;
  }

  dispose(): void {
    this.el.removeEventListener("seeked", this.onSeeked);
    this.pending = null;
  }
}

export class ReverseShuttle {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTick = 0;

  constructor(
    private getCurrentTime: () => number,
    private setCurrentTime: (t: number) => void,
    private tickMs = 50,
    // Идёт ли seek: тик пропускается, lastTick не двигаем, поэтому следующий
    // свободный тик отматывает на всё накопленное время (часы не теряются).
    private isSeeking: () => boolean = () => false,
  ) {}

  start(rate: number): void {
    this.stop();
    this.lastTick = performance.now();
    this.timer = setInterval(() => {
      if (this.isSeeking()) return;
      const now = performance.now();
      const elapsed = (now - this.lastTick) / 1000;
      this.lastTick = now;
      this.setCurrentTime(Math.max(0, this.getCurrentTime() - elapsed * rate));
    }, this.tickMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  get running(): boolean {
    return this.timer !== null;
  }
}
