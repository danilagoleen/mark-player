import { describe, expect, it, vi } from "vitest";
import { ReverseShuttle, getShuttleDisplay, isTypingTarget, resolveJumpTarget, resolvePlayerHotkey, resolveProportionalStep, shuttleSlotClass } from "./playerHotkeys";

function key(code: string, extra: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {
    code,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    repeat: false,
    ...extra,
  } as unknown as KeyboardEvent;
}

describe("resolvePlayerHotkey", () => {
  it("space = playPause", () => {
    expect(resolvePlayerHotkey(key("Space"))).toBe("playPause");
  });

  it("J/K/L = playBack/stop/playForward", () => {
    expect(resolvePlayerHotkey(key("KeyJ"))).toBe("playBack");
    expect(resolvePlayerHotkey(key("KeyK"))).toBe("stop");
    expect(resolvePlayerHotkey(key("KeyL"))).toBe("playForward");
  });

  it("arrows = frame step", () => {
    expect(resolvePlayerHotkey(key("ArrowLeft"))).toBe("frameStepBack");
    expect(resolvePlayerHotkey(key("ArrowRight"))).toBe("frameStepForward");
  });

  it("shift+arrows = proportional step (0.12: вместо 5 кадров)", () => {
    expect(resolvePlayerHotkey(key("ArrowLeft", { shiftKey: true }))).toBe("proportionalStepBack");
    expect(resolvePlayerHotkey(key("ArrowRight", { shiftKey: true }))).toBe("proportionalStepForward");
  });

  it("cmd+arrows = jump to prev/next marker (0.12)", () => {
    expect(resolvePlayerHotkey(key("ArrowLeft", { metaKey: true }))).toBe("jumpPrevMarker");
    expect(resolvePlayerHotkey(key("ArrowRight", { metaKey: true }))).toBe("jumpNextMarker");
    expect(resolvePlayerHotkey(key("ArrowLeft", { metaKey: true, shiftKey: true }))).toBeNull();
    expect(resolvePlayerHotkey(key("ArrowLeft", { metaKey: true, ctrlKey: true }))).toBeNull();
  });

  it("resolveProportionalStep: duration/100 с клампами [0.5, 5]", () => {
    expect(resolveProportionalStep(3)).toBe(0.5);
    expect(resolveProportionalStep(60)).toBeCloseTo(0.6, 10);
    expect(resolveProportionalStep(600)).toBe(5);
    expect(resolveProportionalStep(0)).toBe(0.5);
    expect(resolveProportionalStep(NaN)).toBe(0.5);
  });

  it("arrows up/down = volume [signal: громкость стрелками] [project: cut-player]", () => {
    expect(resolvePlayerHotkey(key("ArrowUp"))).toBe("volumeUp");
    expect(resolvePlayerHotkey(key("ArrowDown"))).toBe("volumeDown");
  });

  it("key repeat разрешён только стрелкам и громкости [signal: зажатая стрелка листает] [project: cut-player]", () => {
    expect(resolvePlayerHotkey(key("ArrowLeft", { repeat: true }))).toBe("frameStepBack");
    expect(resolvePlayerHotkey(key("ArrowRight", { repeat: true }))).toBe("frameStepForward");
    expect(resolvePlayerHotkey(key("ArrowLeft", { repeat: true, shiftKey: true }))).toBe("proportionalStepBack");
    expect(resolvePlayerHotkey(key("ArrowRight", { repeat: true, shiftKey: true }))).toBe("proportionalStepForward");
    expect(resolvePlayerHotkey(key("ArrowUp", { repeat: true }))).toBe("volumeUp");
    expect(resolvePlayerHotkey(key("ArrowDown", { repeat: true }))).toBe("volumeDown");
  });

  it("Home/End = go to start/end", () => {
    expect(resolvePlayerHotkey(key("Home"))).toBe("goToStart");
    expect(resolvePlayerHotkey(key("End"))).toBe("goToEnd");
  });

  it("I/O = mark in/out", () => {
    expect(resolvePlayerHotkey(key("KeyI"))).toBe("markIn");
    expect(resolvePlayerHotkey(key("KeyO"))).toBe("markOut");
  });

  it("F/M/N = favorite/comment/negative markers", () => {
    expect(resolvePlayerHotkey(key("KeyF"))).toBe("addFavoriteMarker");
    expect(resolvePlayerHotkey(key("KeyM"))).toBe("addCommentMarker");
    expect(resolvePlayerHotkey(key("KeyN"))).toBe("addNegativeMarker");
    expect(resolvePlayerHotkey(key("KeyM", { shiftKey: true }))).toBeNull();
    expect(resolvePlayerHotkey(key("KeyF", { shiftKey: true }))).toBeNull();
  });

  it("cmd+F = fullscreen, alt+I = debug", () => {
    expect(resolvePlayerHotkey(key("KeyF", { metaKey: true }))).toBe("toggleFullscreen");
    expect(resolvePlayerHotkey(key("KeyI", { altKey: true }))).toBe("toggleDebug");
  });

  it("Q = cycle quality", () => {
    expect(resolvePlayerHotkey(key("KeyQ"))).toBe("cycleQuality");
  });

  it("Escape = exitFullscreen", () => {
    expect(resolvePlayerHotkey(key("Escape"))).toBe("exitFullscreen");
  });

  it("bare f/m/n via key fallback when code is Unknown", () => {
    expect(resolvePlayerHotkey({ code: "Unknown", key: "f", shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, repeat: false } as unknown as KeyboardEvent)).toBe("addFavoriteMarker");
    expect(resolvePlayerHotkey({ code: "Unknown", key: "m", shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, repeat: false } as unknown as KeyboardEvent)).toBe("addCommentMarker");
    expect(resolvePlayerHotkey({ code: "Unknown", key: "n", shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, repeat: false } as unknown as KeyboardEvent)).toBe("addNegativeMarker");
  });

  it("RU layout letters via key fallback (ЙЦУКЕН: а=f ь=m т=n ш=i щ=o)", () => {
    const ru = (k: string) =>
      ({ code: "Unknown", key: k, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, repeat: false }) as unknown as KeyboardEvent;
    expect(resolvePlayerHotkey(ru("а"))).toBe("addFavoriteMarker");
    expect(resolvePlayerHotkey(ru("А"))).toBe("addFavoriteMarker");
    expect(resolvePlayerHotkey(ru("ь"))).toBe("addCommentMarker");
    expect(resolvePlayerHotkey(ru("т"))).toBe("addNegativeMarker");
    expect(resolvePlayerHotkey(ru("ш"))).toBe("markIn");
    expect(resolvePlayerHotkey(ru("щ"))).toBe("markOut");
  });

  it("Escape via key fallback when code is Unknown [signal: exitFullscreen без code] [project: cut-player]", () => {
    expect(resolvePlayerHotkey({ code: "", key: "Escape", shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, repeat: false } as unknown as KeyboardEvent)).toBe("exitFullscreen");
  });

  it("typing in input eats hotkeys except Escape [signal: ввод без хоткеев] [project: cut-player]", () => {
    const input = document.createElement("input");
    const ev = (code: string, key: string) =>
      ({ code, key, target: input, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, repeat: false }) as unknown as KeyboardEvent;
    expect(resolvePlayerHotkey(ev("Space", " "))).toBeNull();
    expect(resolvePlayerHotkey(ev("KeyF", "f"))).toBeNull();
    expect(resolvePlayerHotkey(ev("KeyJ", "j"))).toBeNull();
    expect(resolvePlayerHotkey(ev("Escape", "Escape"))).toBe("exitFullscreen");
  });

  it("key repeat (holding key) is ignored — shuttle level stays", () => {
    expect(resolvePlayerHotkey(key("KeyL", { repeat: true }))).toBeNull();
    expect(resolvePlayerHotkey(key("KeyJ", { repeat: true }))).toBeNull();
    expect(resolvePlayerHotkey(key("Space", { repeat: true }))).toBeNull();
  });

  it("NLE-scoped keys stay free (c/v/cmd+K/cmd+1-5/y/u/r/h/z)", () => {
    for (const code of ["KeyC", "KeyV", "KeyY", "KeyU", "KeyR", "KeyH", "KeyZ"]) {
      expect(resolvePlayerHotkey(key(code))).toBeNull();
    }
    for (const code of ["KeyK", "Digit1", "Digit2", "Digit3", "Digit4", "Digit5"]) {
      expect(resolvePlayerHotkey(key(code, { metaKey: true }))).toBeNull();
    }
    expect(resolvePlayerHotkey(key("Space", { ctrlKey: true }))).toBeNull();
  });
});

describe("shuttleSlotClass", () => {
  it("слот всегда в DOM, модификатор отражает наличие бейджа [signal: слот шаттла] [project: cut-player]", () => {
    expect(shuttleSlotClass("▶ 1x")).toBe("transport-shuttle-badge has-badge");
    expect(shuttleSlotClass(null)).toBe("transport-shuttle-badge is-empty");
  });
});

describe("isTypingTarget", () => {
  it("ignores input/textarea/select/contenteditable", () => {
    const input = document.createElement("input");
    const textarea = document.createElement("textarea");
    const select = document.createElement("select");
    const contentEditable = document.createElement("div");
    contentEditable.setAttribute("contenteditable", "true");
    const div = document.createElement("div");

    expect(isTypingTarget(input)).toBe(true);
    expect(isTypingTarget(textarea)).toBe(true);
    expect(isTypingTarget(select)).toBe(true);
    expect(isTypingTarget(contentEditable)).toBe(true);
    expect(isTypingTarget(div)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe("getShuttleDisplay", () => {
  it("stop shows Play, not moving, no badge", () => {
    expect(getShuttleDisplay(0, false)).toEqual({ label: "Play", moving: false, badge: null });
  });

  it("playing shows Pause", () => {
    expect(getShuttleDisplay(0, true)).toEqual({ label: "Pause", moving: true, badge: null });
  });

  it("reverse shuttle shows Rewind level + badge (J bug: was Play)", () => {
    expect(getShuttleDisplay(-1, false)).toEqual({ label: "Rewind 1x", moving: true, badge: "◀ 1x" });
    expect(getShuttleDisplay(-3, false)).toEqual({ label: "Rewind 3x", moving: true, badge: "◀ 3x" });
  });

  it("forward shuttle shows Shuttle level + badge", () => {
    expect(getShuttleDisplay(2, true)).toEqual({ label: "Shuttle 2x", moving: true, badge: "▶ 2x" });
  });
});

describe("ReverseShuttle", () => {
  it("steps currentTime back at rate", () => {
    vi.useFakeTimers();
    let t = 10;
    const rs = new ReverseShuttle(
      () => t,
      (v) => (t = v),
      50,
    );
    rs.start(2);
    vi.advanceTimersByTime(150);
    rs.stop();
    expect(t).toBeCloseTo(9.7, 5);
  });

  it("never goes below zero", () => {
    vi.useFakeTimers();
    let t = 0.05;
    const rs = new ReverseShuttle(
      () => t,
      (v) => (t = v),
      50,
    );
    rs.start(3);
    vi.advanceTimersByTime(200);
    rs.stop();
    expect(t).toBe(0);
  });
});

describe("resolveJumpTarget (фикс залипания 27.09)", () => {
  const anchors = [10, 20, 30];
  it("next — первый строго правее, prev — первый строго левее", () => {
    expect(resolveJumpTarget(anchors, 0, 1)).toBe(10);
    expect(resolveJumpTarget(anchors, 0, -1)).toBeUndefined();
    expect(resolveJumpTarget(anchors, 30, 1)).toBeUndefined();
    expect(resolveJumpTarget(anchors, 30, -1)).toBe(20);
  });
  it("стоя на маркере — перепрыгивает через него, а не залипает", () => {
    expect(resolveJumpTarget(anchors, 20, 1)).toBe(30);
    expect(resolveJumpTarget(anchors, 20, -1)).toBe(10);
  });
  it("терпит несортированный вход и пустоту", () => {
    expect(resolveJumpTarget([30, 10, 20], 0, 1)).toBe(10);
    expect(resolveJumpTarget([], 5, 1)).toBeUndefined();
  });
});
