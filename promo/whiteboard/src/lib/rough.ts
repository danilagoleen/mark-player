// Hand-drawn path generators. Deterministic: the same seed draws the same
// wobble on every frame and every render, so lines never "boil".

export type P = [number, number];

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

export const rng = (seed: string) => {
  let a = hash(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const n = (v: number) => Math.round(v * 10) / 10;
const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]];
const len = (a: P) => Math.hypot(a[0], a[1]);

/** One wobbly segment a→b as a cubic: a slight bow plus jitter, like a marker stroke. */
const segment = (a: P, b: P, r: () => number, amp: number) => {
  const d = sub(b, a);
  const L = len(d) || 1;
  const nx = -d[1] / L;
  const ny = d[0] / L;
  const bow = (r() * 2 - 1) * Math.min(amp + L * 0.006, 6);
  const j = () => (r() * 2 - 1) * amp * 0.5;
  const c1: P = [a[0] + d[0] / 3 + nx * bow + j(), a[1] + d[1] / 3 + ny * bow + j()];
  const c2: P = [a[0] + (2 * d[0]) / 3 + nx * bow * 0.8 + j(), a[1] + (2 * d[1]) / 3 + ny * bow * 0.8 + j()];
  return `C ${n(c1[0])} ${n(c1[1])} ${n(c2[0])} ${n(c2[1])} ${n(b[0])} ${n(b[1])}`;
};

/** Polyline with sharp corners and slightly bowed edges. */
export const poly = (pts: P[], seed: string, opts: { closed?: boolean; amp?: number } = {}) => {
  const r = rng(seed);
  const amp = opts.amp ?? 1.6;
  const jit = (p: P): P => [p[0] + (r() * 2 - 1) * amp * 0.6, p[1] + (r() * 2 - 1) * amp * 0.6];
  const q = pts.map(jit);
  if (opts.closed) {
    // A real marker overshoots the closing corner a little.
    const a = q[0];
    const b = q[1];
    const L = len(sub(b, a)) || 1;
    const k = Math.min(16, L * 0.08) / L;
    q.push([a[0] + amp * 0.4, a[1] + amp * 0.4]);
    q.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k + amp * 0.8]);
  }
  let d = `M ${n(q[0][0])} ${n(q[0][1])}`;
  for (let i = 1; i < q.length; i++) d += " " + segment(q[i - 1], q[i], r, amp);
  return d;
};

export const line = (a: P, b: P, seed: string, amp = 1.6) => poly([a, b], seed, { amp });

export const rect = (x: number, y: number, w: number, h: number, seed: string, amp = 1.6) =>
  poly(
    [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ],
    seed,
    { closed: true, amp },
  );

/** Smooth curve through points (Catmull-Rom → cubic Bézier). */
export const smooth = (pts: P[], closed = false) => {
  const p = closed ? [pts[pts.length - 1], ...pts, pts[0], pts[1]] : [pts[0], ...pts, pts[pts.length - 1]];
  let d = `M ${n(p[1][0])} ${n(p[1][1])}`;
  for (let i = 1; i < p.length - 2; i++) {
    const [p0, p1, p2, p3] = [p[i - 1], p[i], p[i + 1], p[i + 2]];
    const c1: P = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: P = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${n(c1[0])} ${n(c1[1])} ${n(c2[0])} ${n(c2[1])} ${n(p2[0])} ${n(p2[1])}`;
  }
  return d;
};

/** Rounded rectangle in one stroke: bowed straight edges, real corner curves, a small overshoot. */
export const roundRect = (x: number, y: number, w: number, h: number, rad: number, seed: string, amp = 1.4) => {
  const r = rng(seed);
  const j = () => (r() * 2 - 1) * amp;
  const rr = Math.min(rad, w / 2, h / 2);
  const start: P = [x + rr + Math.min(w * 0.1, 40), y + j() * 0.5];
  const pts: { edgeTo: P; ctrl: P; end: P }[] = [
    { edgeTo: [x + w - rr, y], ctrl: [x + w, y], end: [x + w, y + rr] },
    { edgeTo: [x + w, y + h - rr], ctrl: [x + w, y + h], end: [x + w - rr, y + h] },
    { edgeTo: [x + rr, y + h], ctrl: [x, y + h], end: [x, y + h - rr] },
    { edgeTo: [x, y + rr], ctrl: [x, y], end: [x + rr, y] },
  ];
  let d = `M ${n(start[0])} ${n(start[1])}`;
  let cur = start;
  for (const c of pts) {
    const e: P = [c.edgeTo[0] + j() * 0.5, c.edgeTo[1] + j() * 0.5];
    d += " " + segment(cur, e, r, amp);
    const end: P = [c.end[0] + j() * 0.5, c.end[1] + j() * 0.5];
    d += ` Q ${n(c.ctrl[0] + j() * 0.4)} ${n(c.ctrl[1] + j() * 0.4)} ${n(end[0])} ${n(end[1])}`;
    cur = end;
  }
  const over: P = [start[0] + Math.min(18, w * 0.06), start[1] + amp * 0.9];
  d += " " + segment(cur, over, r, amp);
  return d;
};

/** Ellipse drawn in one stroke, starting at `start` radians, overshooting a little. */
export const ellipse = (
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  seed: string,
  opts: { start?: number; over?: number; amp?: number } = {},
) => {
  const r = rng(seed);
  const start = opts.start ?? -2.2;
  const over = opts.over ?? 0.35;
  const amp = opts.amp ?? 0.018;
  const steps = 14;
  const pts: P[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = start + ((Math.PI * 2 + over) * i) / steps;
    const k = 1 + (r() * 2 - 1) * amp + (i / steps) * amp * 1.5;
    pts.push([cx + Math.cos(t) * rx * k, cy + Math.sin(t) * ry * k]);
  }
  return smooth(pts);
};

/** Open arc from a0 to a1 (radians). */
export const arc = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, seed: string) => {
  const r = rng(seed);
  const steps = Math.max(4, Math.round(Math.abs(a1 - a0) * 4));
  const pts: P[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = a0 + ((a1 - a0) * i) / steps;
    const k = 1 + (r() * 2 - 1) * 0.015;
    pts.push([cx + Math.cos(t) * rx * k, cy + Math.sin(t) * ry * k]);
  }
  return smooth(pts);
};

/** Five-point star outline (closed), centred on cx,cy. */
export const starPts = (cx: number, cy: number, R: number): P[] => {
  const pts: P[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? R : R * 0.45;
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return pts;
};

export const star = (cx: number, cy: number, R: number, seed: string) =>
  poly(starPts(cx, cy, R), seed, { closed: true, amp: R * 0.03 });

/** Clean (non-wobbly) star for fills. */
export const starFill = (cx: number, cy: number, R: number) =>
  "M " + starPts(cx, cy, R).map((p) => `${n(p[0])} ${n(p[1])}`).join(" L ") + " Z";

/** Arrowhead strokes at the end of a→b. Returns two short lines. */
export const arrowHead = (a: P, b: P, size: number, seed: string): [string, string] => {
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const s = 0.5;
  const l: P = [b[0] - Math.cos(ang - s) * size, b[1] - Math.sin(ang - s) * size];
  const rr: P = [b[0] - Math.cos(ang + s) * size, b[1] - Math.sin(ang + s) * size];
  return [line(l, b, seed + "l", 0.8), line(b, rr, seed + "r", 0.8)];
};

/** Quadratic-ish curved stroke a→b bending by `bend` px to the left of travel. */
export const curve = (a: P, b: P, bend: number, seed: string) => {
  const r = rng(seed);
  const d = sub(b, a);
  const L = len(d) || 1;
  const m: P = [(a[0] + b[0]) / 2 - (d[1] / L) * bend, (a[1] + b[1]) / 2 + (d[0] / L) * bend];
  const j = () => (r() * 2 - 1) * 1.2;
  const q1: P = [(a[0] + m[0]) / 2 + j(), (a[1] + m[1]) / 2 + j()];
  const q2: P = [(m[0] + b[0]) / 2 + j(), (m[1] + b[1]) / 2 + j()];
  return smooth([a, q1, m, q2, b]);
};
