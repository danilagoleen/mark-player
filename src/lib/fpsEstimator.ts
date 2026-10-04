/**
 * FPS-цепочка для честного покадрового шага (UPD 11–13, Шаг 2/7).
 * container (заголовок MP4/MOV) → probe fps → оценка requestVideoFrameCallback → фолбэк 25.
 * Формула: fps = n / Σ(Δt/Δframes).
 */

export const FPS_FALLBACK = 25;
export const VOLUME_STEP = 0.05;
const MAX_SANE_FPS = 240;

export function hasRequestVideoFrameCallback(video: unknown): boolean {
  if (!video || typeof video !== "object") return false;
  return (
    "requestVideoFrameCallback" in video &&
    typeof (video as Record<string, unknown>).requestVideoFrameCallback === "function"
  );
}

// Целые частоты, к которым притягивается оценка (NTSC 23.976/29.97/59.94 —
// к 24/30/60, как и раньше давало округление).
const STANDARD_FPS = [24, 25, 30, 48, 50, 60, 72, 90, 100, 120];
const SNAP_TOLERANCE = 0.03;

/**
 * Приёмка Белла 2026-09-26: было среднее Δt/Δframes. Выпавший кадр
 * (presentedFrames +1 при mediaTime +2 кадра) даёт сэмпл 2/fps, и на тяжёлом
 * HEVC 1080p50 среднее ушло в 46 → XML timebase 46. Медиана выпадения не
 * видит, пока их меньше половины; затем привязка к стандартной частоте ±3%.
 */
export function estimateFpsFromSamples(samples: number[]): number | null {
  if (samples.length === 0) return null;
  for (const s of samples) {
    if (!Number.isFinite(s) || s <= 0) return null;
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const raw = 1 / median;
  if (!Number.isFinite(raw) || raw <= 0) return null;
  let standard: number | undefined;
  for (const f of STANDARD_FPS) {
    const dist = Math.abs(raw - f) / f;
    if (dist <= SNAP_TOLERANCE && (standard === undefined || dist < Math.abs(raw - standard) / standard)) {
      standard = f;
    }
  }
  const fps = standard ?? Math.round(raw);
  if (fps <= 0 || fps > MAX_SANE_FPS) return null;
  return fps;
}

export function resolveFrameStepSeconds(opts: {
  containerFps?: number | null;
  probeFps?: number | null;
  estimatedFps?: number | null;
}): number {
  const candidates = [opts.containerFps, opts.probeFps, opts.estimatedFps];
  for (const fps of candidates) {
    if (typeof fps === "number" && Number.isFinite(fps) && fps > 0 && fps <= MAX_SANE_FPS) {
      return 1 / fps;
    }
  }
  return 1 / FPS_FALLBACK;
}

export interface FrameCalibrator {  pushSample(mediaTime: number, presentedFrames: number, playbackRate: number): void;
  readonly sampleCount: number;
  readonly done: boolean;
}

/**
 * Чистый драйвер калибровки: собирает Δt/Δframes только на rate=1,
 * при достижении requiredSamples один раз зовёт onEstimate.
 * Сам rVFC-цикл живёт в App (нужен живой <video>), сюда приходят цифры.
 */
export function createFrameCalibrator(
  onEstimate: (fps: number) => void,
  requiredSamples = 50,
): FrameCalibrator {
  const samples: number[] = [];
  let lastTime = 0;
  let lastFrames = 0;
  let finished = false;
  return {
    pushSample(mediaTime: number, presentedFrames: number, playbackRate: number) {
      if (finished) return;
      if (playbackRate !== 1) {
        lastTime = mediaTime;
        lastFrames = presentedFrames;
        return;
      }
      if (lastTime) {
        const dt = Math.abs(mediaTime - lastTime);
        const df = Math.abs(presentedFrames - lastFrames);
        if (dt > 0 && df > 0 && dt / df < 1) {
          samples.push(dt / df);
        }
      }
      lastTime = mediaTime;
      lastFrames = presentedFrames;
      if (samples.length >= requiredSamples) {
        const fps = estimateFpsFromSamples(samples);
        finished = true;
        if (fps !== null) onEstimate(fps);
      }
    },
    get sampleCount() {
      return samples.length;
    },
    get done() {
      return finished;
    },
  };
}
