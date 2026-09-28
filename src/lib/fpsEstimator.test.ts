import { describe, expect, it } from "vitest";
import {
  FPS_FALLBACK,
  VOLUME_STEP,
  createFrameCalibrator,
  estimateFpsFromSamples,
  hasRequestVideoFrameCallback,
  resolveFrameStepSeconds,
} from "./fpsEstimator";

// [signal: честные кадры 0.10.29] [project: cut-player]
// RED: модуля fpsEstimator ещё нет. Формула fps = n/Σ(Δt/Δframes) (UPD 11–13).

describe("estimateFpsFromSamples", () => {
  it("50 сэмплов 1/25 → 25", () => {
    expect(estimateFpsFromSamples(Array(50).fill(1 / 25))).toBe(25);
  });

  it("пусто и мусор → null", () => {
    expect(estimateFpsFromSamples([])).toBeNull();
    expect(estimateFpsFromSamples([0, -1, Number.NaN, Number.POSITIVE_INFINITY])).toBeNull();
  });

  it("абсурд >240fps → null", () => {
    expect(estimateFpsFromSamples(Array(50).fill(1 / 1000))).toBeNull();
  });

  // Приёмка Белла 2026-09-26: HEVC 1080p50 оператора → XML timebase 46.
  // Выпавший кадр = presentedFrames +1 при mediaTime +2 кадра → сэмпл 2/fps.
  const withDrops = (fps: number, n: number, dropEvery: number) =>
    Array.from({ length: n }, (_, i) => (i % dropEvery === 0 ? 2 / fps : 1 / fps));

  it("50p с выпадениями 10–30% кадров → ровно 50", () => {
    expect(estimateFpsFromSamples(withDrops(50, 50, 10))).toBe(50);
    expect(estimateFpsFromSamples(withDrops(50, 50, 4))).toBe(50);
    expect(estimateFpsFromSamples(withDrops(50, 50, 3))).toBe(50);
  });

  it("стандартные частоты стабильны, джиттер ±2% притягивается", () => {
    expect(estimateFpsFromSamples(Array(50).fill(1 / 24))).toBe(24);
    expect(estimateFpsFromSamples(Array(50).fill(1 / 30))).toBe(30);
    expect(estimateFpsFromSamples(Array(50).fill(1 / 29.97))).toBe(30);
    expect(estimateFpsFromSamples(Array(50).fill(1 / 49))).toBe(50);
    expect(estimateFpsFromSamples(Array(50).fill(1 / 59.94))).toBe(60);
  });

  it("нестандартная частота не притягивается к соседней", () => {
    expect(estimateFpsFromSamples(Array(50).fill(1 / 15))).toBe(15);
    expect(estimateFpsFromSamples(Array(50).fill(1 / 40))).toBe(40);
  });
});

describe("resolveFrameStepSeconds", () => {
  it("цепочка: probe → оценка → фолбэк 25", () => {
    expect(resolveFrameStepSeconds({ probeFps: 24, estimatedFps: 25 })).toBeCloseTo(1 / 24, 6);
    expect(resolveFrameStepSeconds({ probeFps: null, estimatedFps: 25 })).toBeCloseTo(1 / 25, 6);
    expect(resolveFrameStepSeconds({})).toBeCloseTo(1 / FPS_FALLBACK, 6);
  });

  it("битый probe игнорируется", () => {
    expect(resolveFrameStepSeconds({ probeFps: 0, estimatedFps: null })).toBeCloseTo(0.04, 6);
    expect(resolveFrameStepSeconds({ probeFps: -5 })).toBeCloseTo(0.04, 6);
  });
});

describe("createFrameCalibrator", () => {
  it("50 валидных сэмплов на rate=1 → onEstimate(25), дальше молчит", () => {
    const seen: number[] = [];
    const cal = createFrameCalibrator((fps) => seen.push(fps), 50);
    let t = 0;
    for (let f = 1; f <= 60; f++) {
      t += 1 / 25;
      cal.pushSample(t, f, 1);
    }
    expect(seen).toEqual([25]);
    expect(cal.sampleCount).toBe(50);
  });

  it("сэмплы не на rate=1 и нулевые дельты отбрасываются", () => {
    const seen: number[] = [];
    const cal = createFrameCalibrator((fps) => seen.push(fps), 3);
    cal.pushSample(1, 10, 2);
    cal.pushSample(1, 10, 1);
    cal.pushSample(2, 10, 1);
    expect(seen).toEqual([]);
    expect(cal.sampleCount).toBe(0);
  });
});

describe("hasRequestVideoFrameCallback", () => {
  it("detect: есть метод → true, нет → false", () => {
    expect(hasRequestVideoFrameCallback({ requestVideoFrameCallback: () => 0 })).toBe(true);
    expect(hasRequestVideoFrameCallback({})).toBe(false);
    expect(hasRequestVideoFrameCallback(null)).toBe(false);
  });
});

describe("constants", () => {
  it("фолбэк 25, шаг громкости 0.05", () => {
    expect(FPS_FALLBACK).toBe(25);
    expect(VOLUME_STEP).toBe(0.05);
  });
});
