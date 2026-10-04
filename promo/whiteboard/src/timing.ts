import data from "./scenes.json";

export const FPS: number = data.fps;
export const DURATION_SEC: number = data.duration_sec;
export const DURATION_FRAMES = Math.round(DURATION_SEC * FPS);

const GRID_ORIGIN = 6.04;
const BEAT = data.beat_grid.beat_sec;

/** Beat grid from the brief: G(k) = 6.04 + k * 0.6667 (seconds). */
export const G = (k: number) => GRID_ORIGIN + k * BEAT;

/** Seconds → frame, the rule agreed for ±1-frame accuracy: round(sec × fps). */
export const fr = (sec: number) => Math.round(sec * FPS);

/** Snap a time in seconds to the exact frame it will land on. */
export const snap = (sec: number) => fr(sec) / FPS;

export type SceneId =
  | "S1_client"
  | "S2_mark"
  | "S3_editor"
  | "S4_agent"
  | "S5_in_out"
  | "S6_rough_cut"
  | "S7_uses"
  | "S8_finale";

type RawScene = (typeof data.scenes)[number];

export interface SceneDef {
  id: SceneId;
  from: number;
  to: number;
  captions: { at: number; text: string }[];
  beats: Record<string, number>;
  vo: string;
}

/** "G(2) = 7.37" → 7.37, "38.04" → 38.04. The number after "=" is authoritative. */
const parseBeat = (v: string) => Number(v.includes("=") ? v.split("=")[1] : v);

const toDef = (s: RawScene): SceneDef => {
  const raw = s as RawScene & {
    caption?: string;
    captions?: { at: number; text: string }[];
    beats?: Record<string, string>;
  };
  const beats: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw.beats ?? {})) beats[k] = parseBeat(v);
  return {
    id: s.id as SceneId,
    from: s.from,
    to: s.to,
    // A single `caption` has no `at`: the scene decides when its drawing settles.
    captions: raw.captions ?? (raw.caption ? [{ at: NaN, text: raw.caption }] : []),
    beats,
    vo: s.vo,
  };
};

export const SCENES: SceneDef[] = data.scenes.map(toDef);

export const scene = (id: SceneId): SceneDef => {
  const s = SCENES.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown scene ${id}`);
  return s;
};

/** Every scene pans out over its last EXIT seconds (the board slides away). */
export const EXIT = 0.3;
