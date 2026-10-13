import { describe, expect, it } from "vitest";
import {
  MARKER_DRAG_THRESHOLD_PX,
  PLAYHEAD_HALO_PX,
  hitTestPlayhead,
  markerDragThresholdPassed,
  type PlayheadHitInput,
} from "./playheadHit";

// tb_1791844731_63972_4: приёмка §5.1 — каждая строка таблицы §3.2 отдельно.
describe("hitTestPlayhead (§3.2)", () => {
  const base: PlayheadHitInput = {
    row: "lane",
    x: 100,
    playheadX: 300,
    markers: [{ id: "f1", x: 100, halfWidth: 10.5 }],
    altKey: false,
  };

  it("п.1: линейка — плейхед где угодно, даже на значке и с Alt", () => {
    expect(hitTestPlayhead({ ...base, row: "ruler" })).toEqual({ target: "playhead" });
    expect(hitTestPlayhead({ ...base, row: "ruler", x: 100, altKey: true })).toEqual({ target: "playhead" });
  });

  it("п.2: шарики и ±5px от линии — плейхед на любой высоте", () => {
    expect(hitTestPlayhead({ ...base, x: 300, markers: [] })).toEqual({ target: "playhead" });
    expect(hitTestPlayhead({ ...base, x: 300 + PLAYHEAD_HALO_PX, markers: [] })).toEqual({ target: "playhead" });
    expect(hitTestPlayhead({ ...base, x: 300 - PLAYHEAD_HALO_PX, markers: [] })).toEqual({ target: "playhead" });
    expect(hitTestPlayhead({ ...base, x: 300 + PLAYHEAD_HALO_PX + 1, markers: [] })).toEqual({ target: "scrub" });
  });

  it("маркер под плейхедом без Alt — плейхед", () => {
    expect(hitTestPlayhead({ ...base, x: 300, playheadX: 300, markers: [{ id: "f1", x: 300, halfWidth: 10.5 }] })).toEqual({
      target: "playhead",
    });
  });

  it("п.3: тот же маркер с Alt — маркер (запасной путь из-под плейхеда)", () => {
    expect(
      hitTestPlayhead({
        ...base,
        x: 300,
        playheadX: 300,
        markers: [{ id: "f1", x: 300, halfWidth: 10.5 }],
        altKey: true,
      }),
    ).toEqual({ target: "marker", markerId: "f1" });
  });

  it("п.4: значок вне зоны плейхеда — маркер", () => {
    expect(hitTestPlayhead(base)).toEqual({ target: "marker", markerId: "f1" });
  });

  it("п.4: из двух перекрывшихся берём ближайший", () => {
    expect(
      hitTestPlayhead({
        ...base,
        x: 105,
        markers: [
          { id: "f1", x: 100, halfWidth: 10.5 },
          { id: "n1", x: 108, halfWidth: 10.5 },
        ],
      }),
    ).toEqual({ target: "marker", markerId: "n1" });
  });

  it("п.4: край значка — ещё маркер, за краем — уже scrub", () => {
    expect(hitTestPlayhead({ ...base, x: 100 + 10.5 })).toEqual({ target: "marker", markerId: "f1" });
    expect(hitTestPlayhead({ ...base, x: 100 + 10.6 })).toEqual({ target: "scrub" });
  });

  it("п.5: пустое место рядов — scrub", () => {
    expect(hitTestPlayhead({ ...base, x: 200, markers: [] })).toEqual({ target: "scrub" });
    expect(hitTestPlayhead({ ...base, x: 200 })).toEqual({ target: "scrub" });
  });
});

describe("markerDragThresholdPassed (§3.3)", () => {
  it("3px и отпускание — клик: порог не пройден", () => {
    expect(markerDragThresholdPassed(100, 103)).toBe(false);
    expect(markerDragThresholdPassed(100, 97)).toBe(false);
  });

  it("4px — значок поехал (порог включительно)", () => {
    expect(markerDragThresholdPassed(100, 104)).toBe(true);
    expect(markerDragThresholdPassed(100, 96)).toBe(true);
  });

  it("константа порога — 4px по спеке", () => {
    expect(MARKER_DRAG_THRESHOLD_PX).toBe(4);
    expect(PLAYHEAD_HALO_PX).toBe(5);
  });
});
