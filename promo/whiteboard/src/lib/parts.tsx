// Reusable drawings: player, keycap, markers, flights.
import React from "react";
import { Draw, G, Hand, INK, easeIn, easeOut, lerp, pop, prog, squash, useT } from "./draw";
import { line, poly, rect, roundRect, starFill, star, type P } from "./rough";

/* ----------------------------------------------------------------- player */

export interface PlayerGeo {
  x: number;
  y: number;
  w: number;
  h: number;
  barY: number;
  barX0: number;
  barX1: number;
}

export const playerGeo = (x: number, y: number, w: number, barGap = 80): PlayerGeo => {
  const h = Math.round((w * 9) / 16);
  return { x, y, w, h, barY: y + h + barGap, barX0: x + 10, barX1: x + w - 10 };
};

export const barX = (g: PlayerGeo, p: number) => g.barX0 + (g.barX1 - g.barX0) * p;

/** Frame, play triangle in the middle, scrub bar under it. Times are absolute seconds. */
export const Player: React.FC<{ g: PlayerGeo; at: number; seed?: string; frameDur?: number; triangle?: boolean }> = ({
  g,
  at,
  seed = "pl",
  frameDur = 0.46,
  triangle = true,
}) => {
  const cx = g.x + g.w / 2;
  const cy = g.y + g.h / 2;
  const s = g.h * 0.13;
  const tri = poly(
    [
      [cx - s * 0.8, cy - s],
      [cx + s, cy],
      [cx - s * 0.8, cy + s],
    ],
    seed + "tri",
    { closed: true, amp: 1.2 },
  );
  const tAt = at + frameDur + 0.02;
  const bAt = tAt + (triangle ? 0.2 : 0);
  return (
    <>
      <Draw d={rect(g.x, g.y, g.w, g.h, seed + "frame", 2)} at={at} dur={frameDur} w={6} />
      {triangle && <Draw d={tri} at={tAt} dur={0.18} w={6} />}
      <Draw d={line([g.barX0, g.barY], [g.barX1, g.barY], seed + "bar", 1.2)} at={bAt} dur={0.24} w={7} />
    </>
  );
};

export const playerDoneAt = (at: number, frameDur = 0.46, triangle = true) => at + frameDur + 0.02 + (triangle ? 0.2 : 0) + 0.24;

/** Playhead: a short vertical line with a dot, crossing the bar. */
export const Playhead: React.FC<{ x: number; y: number; o?: number; scale?: number }> = ({ x, y, o = 1, scale = 1 }) => (
  <G x={x} y={y} o={o} s={scale}>
    <path d={line([0, -30], [0, 30], "ph", 0.4)} stroke={INK} strokeWidth={5} strokeLinecap="round" fill="none" />
    <circle cx={0} cy={-34} r={9} fill={INK} />
  </G>
);

/** Piecewise-linear playhead position over time: [[t, p], ...]. */
export const track = (t: number, keys: [number, number][]) => {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [t0, p0] = keys[i - 1];
      const [t1, p1] = keys[i];
      return lerp(p0, p1, (t - t0) / (t1 - t0));
    }
  }
  return keys[keys.length - 1][1];
};

/* ----------------------------------------------------------------- keycap */

/**
 * Keycap sketch (outer rim + top face + letter), centred on 0,0.
 * Drawn on at `at`, pressed on `press` (squash + impact ticks), gone at `out`.
 */
export const Keycap: React.FC<{
  letter: string;
  at: number;
  press: number;
  out?: number;
  size?: number;
  seed?: string;
}> = ({ letter, at, press, out = Infinity, size = 180, seed = "key" }) => {
  const t = useT();
  if (t >= out + 0.16) return null;
  const S = size;
  const outScale = t >= out ? 1 - easeIn(prog(t, out, 0.16)) : 1;
  const pressed = t >= press && t < press + 0.16;
  const sq = squash(t, press, 0.2);
  const dy = pressed ? 6 : 0;
  const impact = prog(t, press, 0.26);
  const ticks = [-140, -90, -40].map((a) => {
    const r = (a * Math.PI) / 180;
    const r0 = S * 0.66 + impact * 14;
    const r1 = r0 + 26;
    return line([Math.cos(r) * r0, Math.sin(r) * r0], [Math.cos(r) * r1, Math.sin(r) * r1], seed + "imp" + a, 0.4);
  });
  return (
    <G s={outScale} sy={sq} sx={2 - sq}>
      <Draw d={roundRect(-S / 2, -S / 2, S, S, S * 0.16, seed + "outer")} at={at} dur={0.2} w={6} />
      <G y={dy}>
        <Draw d={roundRect(-S / 2 + S * 0.12, -S / 2 + S * 0.08, S * 0.76, S * 0.68, S * 0.12, seed + "inner", 1)} at={at + 0.21} dur={0.14} w={4} />
        <Hand x={0} y={S * 0.04 + S * 0.2} text={letter} size={S * 0.56} weight={700} anchor="middle" at={at + 0.36} dur={0.1} />
      </G>
      {impact > 0 && impact < 1 && (
        <g opacity={1 - impact}>
          {ticks.map((d, i) => (
            <path key={i} d={d} stroke={INK} strokeWidth={5} strokeLinecap="round" fill="none" />
          ))}
        </g>
      )}
    </G>
  );
};

/* ---------------------------------------------------------------- markers */

/** Comment pin: a small speech bubble whose tail touches the bar at 0,0. */
export const PinMark: React.FC<{ at: number; drawn?: boolean; seed?: string }> = ({ at, drawn = false, seed = "pin" }) => {
  const t = useT();
  const body = roundRect(-30, -78, 60, 44, 12, seed + "b", 0.8);
  const tail = poly([[-8, -36], [0, -6], [10, -36]], seed + "t", { amp: 0.5 });
  const dots = [-13, 0, 13].map((x) => <circle key={x} cx={x} cy={-56} r={4} fill={INK} />);
  if (drawn) {
    return (
      <>
        <Draw d={body} at={at} dur={0.16} w={5} />
        <Draw d={tail} at={at + 0.17} dur={0.06} w={5} />
        {t >= at + 0.24 && dots}
      </>
    );
  }
  if (t < at) return null;
  return (
    <>
      <path d={body} stroke={INK} strokeWidth={5} fill="#f7f5f0" strokeLinecap="round" />
      <path d={tail} stroke={INK} strokeWidth={5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {dots}
    </>
  );
};

/** Filled star sitting on the bar at 0,0. */
export const StarMark: React.FC<{ at: number; R?: number }> = ({ at, R = 26 }) => {
  const t = useT();
  if (t < at) return null;
  return (
    <>
      <path d={starFill(0, -R - 10, R)} fill={INK} />
      <path d={star(0, -R - 10, R, "starO")} stroke={INK} strokeWidth={4} fill="none" strokeLinejoin="round" />
    </>
  );
};

/** ✗ sitting on the bar at 0,0. */
export const CrossMark: React.FC<{ at: number; s?: number }> = ({ at, s = 20 }) => {
  const t = useT();
  if (t < at) return null;
  const cy = -s - 14;
  return (
    <g stroke={INK} strokeWidth={7} strokeLinecap="round" fill="none">
      <path d={line([-s, cy - s], [s, cy + s], "x1", 0.6)} />
      <path d={line([s, cy - s * 1.05], [-s * 0.95, cy + s], "x2", 0.6)} />
    </g>
  );
};

/* ---------------------------------------------------------------- motion */

/**
 * Flight from `a` to `b` that lands exactly at `land` (a beat), with an arc of
 * height `arc` and a squash on landing. Before `start` the item rests at `a`.
 */
export const Fly: React.FC<{ a: P; b: P; start: number; land: number; arc?: number; scaleFrom?: number; scaleTo?: number; children: React.ReactNode }> = ({
  a,
  b,
  start,
  land,
  arc = 160,
  scaleFrom = 1,
  scaleTo = 1,
  children,
}) => {
  const t = useT();
  const u = prog(t, start, land - start);
  const e = u < 1 ? 1 - Math.pow(1 - u, 1.6) * (1 - u * 0.0) : 1;
  const k = u < 1 ? easeOut(u) * 0.35 + easeIn(u) * 0.65 : 1;
  const x = lerp(a[0], b[0], k);
  const y = lerp(a[1], b[1], k) - Math.sin(Math.PI * k) * arc;
  const sc = lerp(scaleFrom, scaleTo, e);
  const sq = squash(t, land, 0.2);
  return (
    <G x={x} y={y} s={sc} sx={2 - sq} sy={sq}>
      {children}
    </G>
  );
};

/** Pops a child in at `at` (scale overshoot). */
export const Pop: React.FC<{ at: number; dur?: number; x?: number; y?: number; children: React.ReactNode }> = ({ at, dur = 0.2, x = 0, y = 0, children }) => {
  const t = useT();
  const s = pop(t, at, dur);
  if (s <= 0) return null;
  return (
    <G x={x} y={y} s={s}>
      {children}
    </G>
  );
};
