import React, { createContext, useContext, useId } from "react";
import { getLength, getPointAtLength } from "@remotion/paths";
import { useCurrentFrame } from "remotion";
import { FPS } from "../timing";
import { arrowHead, line, starFill, type P } from "./rough";

export const INK = "#141414";
export const PAPER = "#f7f5f0";
export const FONT = "Caveat";

/* ------------------------------------------------------------------ time */

export const useT = () => useCurrentFrame() / FPS;

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** 0→1 progress of `t` through [at, at+dur]. */
export const prog = (t: number, at: number, dur: number) => (dur <= 0 ? (t >= at ? 1 : 0) : clamp01((t - at) / dur));
export const easeInOut = (u: number) => 0.5 - 0.5 * Math.cos(Math.PI * u);
export const easeOut = (u: number) => 1 - (1 - u) * (1 - u) * (1 - u);
export const easeIn = (u: number) => u * u * u;
/** Marker speed: mostly even, slowing a touch at both ends. */
export const penEase = (u: number) => 0.6 * u + 0.4 * easeInOut(u);
export const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

/** Pop-in scale: 0 → overshoot → 1 over `dur`, reaching full size at `at + dur`. */
export const pop = (t: number, at: number, dur = 0.22) => {
  const u = prog(t, at, dur);
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  const s = Math.sin(u * Math.PI * 0.5);
  return s * (1 + 0.18 * Math.sin(u * Math.PI));
};

/** Squash on impact at `at` (1 → 0.88 → 1). */
export const squash = (t: number, at: number, dur = 0.18) => {
  const u = (t - at) / dur;
  if (u < 0 || u > 1) return 1;
  return 1 - 0.12 * Math.sin(u * Math.PI);
};

/* ------------------------------------------------------------ transforms */

type M = [number, number, number, number, number, number];
const I: M = [1, 0, 0, 1, 0, 0];
const mul = (m: M, n: M): M => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m: M, p: P): P => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];

const MatrixCtx = createContext<M>(I);

/** Group: translate(x,y) rotate(r°) scale(s) about the local origin. Tracks the matrix for the pen. */
export const G: React.FC<{
  x?: number;
  y?: number;
  r?: number;
  s?: number;
  sx?: number;
  sy?: number;
  o?: number;
  children: React.ReactNode;
}> = ({ x = 0, y = 0, r = 0, s = 1, sx, sy, o = 1, children }) => {
  const parent = useContext(MatrixCtx);
  const a = (r * Math.PI) / 180;
  const kx = (sx ?? 1) * s;
  const ky = (sy ?? 1) * s;
  const local: M = [Math.cos(a) * kx, Math.sin(a) * kx, -Math.sin(a) * ky, Math.cos(a) * ky, x, y];
  if (o <= 0.001) return null;
  return (
    <MatrixCtx.Provider value={mul(parent, local)}>
      <g transform={`matrix(${local.join(" ")})`} opacity={o}>
        {children}
      </g>
    </MatrixCtx.Provider>
  );
};

/* ------------------------------------------------------------------ pen */

interface PenEntry {
  start: number;
  end: number;
  at: (u: number) => P;
}
interface Collector {
  entries: PenEntry[];
}
const PenCtx = createContext<Collector>({ entries: [] });

const usePenRegister = () => {
  const col = useContext(PenCtx);
  const m = useContext(MatrixCtx);
  return (start: number, end: number, at: (u: number) => P) =>
    col.entries.push({ start, end, at: (u) => apply(m, at(u)) });
};

const lenCache = new Map<string, number>();
export const pathLength = (d: string) => {
  let L = lenCache.get(d);
  if (L === undefined) {
    L = getLength(d);
    lenCache.set(d, L);
  }
  return L;
};

/* ----------------------------------------------------------------- strokes */

export interface DrawProps {
  d: string;
  at: number;
  dur: number;
  w?: number;
  fill?: boolean;
  /** seconds the fill takes to come in after the stroke completes */
  fillDur?: number;
  pen?: boolean;
  o?: number;
  dash?: string;
}

/** A stroke drawn on with stroke-dashoffset; the marker follows its tip. */
export const Draw: React.FC<DrawProps> = ({ d, at, dur, w = 6, fill = false, fillDur = 0.12, pen = true, o = 1, dash }) => {
  const t = useT();
  const register = usePenRegister();
  if (pen) register(at, at + dur, (u) => {
    const L = pathLength(d);
    const pt = getPointAtLength(d, L * penEase(u));
    return pt ? [pt.x, pt.y] : [0, 0];
  });
  const u = prog(t, at, dur);
  if (u <= 0) return null;
  const fillO = fill ? prog(t, at + dur, fillDur) : 0;
  const common = {
    d,
    fill: "none",
    stroke: INK,
    strokeWidth: w,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    opacity: o,
  };
  let stroke: React.ReactNode;
  if (u >= 1) {
    stroke = <path {...common} strokeDasharray={dash} />;
  } else {
    const L = pathLength(d);
    stroke = <path {...common} strokeDasharray={`${L} ${L}`} strokeDashoffset={L * (1 - penEase(u))} />;
  }
  return (
    <>
      {fillO > 0 && <path d={d} fill={INK} opacity={fillO * o} />}
      {stroke}
    </>
  );
};

/** Several strokes in sequence within [at, at+dur], time split by length. */
export const DrawSeq: React.FC<Omit<DrawProps, "d"> & { ds: string[]; gap?: number }> = ({ ds, at, dur, gap = 0.03, ...rest }) => {
  const lens = ds.map(pathLength);
  const total = lens.reduce((a, b) => a + b, 0) || 1;
  const usable = Math.max(0.01, dur - gap * (ds.length - 1));
  let cursor = at;
  return (
    <>
      {ds.map((d, i) => {
        const dd = (usable * lens[i]) / total;
        const el = <Draw key={i} d={d} at={cursor} dur={dd} {...rest} />;
        cursor += dd + gap;
        return el;
      })}
    </>
  );
};

/**
 * Reveal children with a left→right wipe while the marker scribbles across
 * (used for hatching, sprocket holes, small details, the icon).
 */
export const Wipe: React.FC<{
  at: number;
  dur: number;
  x: number;
  y: number;
  w: number;
  h: number;
  pen?: boolean;
  rows?: number;
  children: React.ReactNode;
}> = ({ at, dur, x, y, w, h, pen = true, rows = 2, children }) => {
  const t = useT();
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const register = usePenRegister();
  if (pen)
    register(at, at + dur, (u) => {
      const zig = Math.abs(((u * rows * 2) % 2) - 1); // 1→0→1 per row pass
      return [x + w * u, y + h * (0.15 + 0.7 * (1 - zig))];
    });
  const u = prog(t, at, dur);
  if (u <= 0) return null;
  if (u >= 1) return <>{children}</>;
  return (
    <>
      <defs>
        <clipPath id={`w${id}`}>
          <rect x={x - 4} y={y - 4} width={(w + 8) * u} height={h + 8} />
        </clipPath>
      </defs>
      <g clipPath={`url(#w${id})`}>{children}</g>
    </>
  );
};

/* ------------------------------------------------------------------- text */

let canvas: HTMLCanvasElement | null = null;
export const measure = (text: string, size: number, weight = 400) => {
  if (typeof document === "undefined") return text.length * size * 0.42;
  canvas = canvas ?? document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  ctx.font = `${weight} ${size}px ${FONT}`;
  return ctx.measureText(text).width;
};

// Caveat has no ★ ✗ →: they are drawn as marker shapes inline.
const GLYPHS: Record<string, number> = { "★": 0.62, "✗": 0.5, "→": 0.8 };
type Tok = { s: string; glyph: boolean; x: number; w: number };

export const layoutText = (text: string, size: number, weight = 400) => {
  const toks: Tok[] = [];
  let x = 0;
  for (const part of text.split(/([★✗→])/)) {
    if (!part) continue;
    const glyph = part in GLYPHS;
    const w = glyph ? GLYPHS[part] * size : measure(part, size, weight);
    toks.push({ s: part, glyph, x, w });
    x += w;
  }
  return { toks, width: x };
};

export const Glyph: React.FC<{ g: string; x: number; y: number; size: number; w?: number }> = ({ g, x, y, size, w }) => {
  const sw = w ?? Math.max(3, size * 0.075);
  const cy = y - size * 0.3;
  if (g === "★") return <path d={starFill(x + size * 0.31, cy, size * 0.3)} fill={INK} stroke={INK} strokeWidth={sw * 0.5} strokeLinejoin="round" />;
  const common = { fill: "none", stroke: INK, strokeWidth: sw, strokeLinecap: "round" as const };
  if (g === "✗") {
    const s = size * 0.2;
    const cx = x + size * 0.25;
    return (
      <g {...common}>
        <path d={line([cx - s, cy - s], [cx + s, cy + s], "gx1", 0.4)} />
        <path d={line([cx + s, cy - s * 1.1], [cx - s * 0.9, cy + s], "gx2", 0.4)} />
      </g>
    );
  }
  // →
  const a: P = [x + size * 0.1, cy];
  const b: P = [x + size * 0.68, cy];
  const [h1, h2] = arrowHead(a, b, size * 0.2, "ga");
  return (
    <g {...common}>
      <path d={line(a, b, "gal", 0.4)} />
      <path d={h1} />
      <path d={h2} />
    </g>
  );
};

/** Handwritten text, revealed left→right with the marker writing it. */
export const Hand: React.FC<{
  x: number;
  y: number;
  text: string;
  size?: number;
  weight?: number;
  at: number;
  dur?: number;
  anchor?: "start" | "middle" | "end";
  pen?: boolean;
  o?: number;
}> = ({ x, y, text, size = 48, weight = 500, at, dur, anchor = "start", pen = true, o = 1 }) => {
  const t = useT();
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const register = usePenRegister();
  const { toks, width } = layoutText(text, size, weight);
  const x0 = anchor === "start" ? x : anchor === "middle" ? x - width / 2 : x - width;
  const D = dur ?? Math.max(0.2, text.length * 0.04);
  if (pen)
    register(at, at + D, (u) => [x0 + width * u, y - size * 0.3 + Math.sin(u * text.length * 2.2) * size * 0.16]);
  const u = prog(t, at, D);
  if (u <= 0) return null;
  const body = (
    <g opacity={o}>
      {toks.map((tk, i) =>
        tk.glyph ? (
          <Glyph key={i} g={tk.s} x={x0 + tk.x} y={y} size={size} />
        ) : (
          <text
            key={i}
            x={x0 + tk.x}
            y={y}
            fontFamily={FONT}
            fontSize={size}
            fontWeight={weight}
            fill={INK}
            style={{ whiteSpace: "pre" }}
          >
            {tk.s}
          </text>
        ),
      )}
    </g>
  );
  if (u >= 1) return body;
  return (
    <>
      <defs>
        <clipPath id={`h${id}`}>
          <rect x={x0 - size * 0.2} y={y - size * 1.2} width={(width + size * 0.3) * u + size * 0.1} height={size * 1.8} />
        </clipPath>
      </defs>
      <g clipPath={`url(#h${id})`}>{body}</g>
    </>
  );
};

/* ------------------------------------------------------------------ board */

const PenSprite: React.FC<{ x: number; y: number; o: number; scale: number }> = ({ x, y, o, scale }) => (
  <g transform={`translate(${x} ${y}) scale(${scale}) rotate(52)`} opacity={o}>
    <g transform="translate(10 16)" opacity={0.14} filter="url(#penShadow)">
      <path d="M0 0 L22 -9 L270 -22 L280 0 L270 22 L22 9 Z" fill="#000" />
    </g>
    <path d="M0 0 L20 -8 L20 8 Z" fill={INK} stroke={INK} strokeWidth={2} strokeLinejoin="round" />
    <rect x={19} y={-14} width={26} height={28} rx={3} fill="#2a2a2a" stroke={INK} strokeWidth={3} />
    <rect x={44} y={-21} width={214} height={42} rx={10} fill="#fcfbf8" stroke={INK} strokeWidth={3.5} />
    <line x1={112} y1={-21} x2={112} y2={21} stroke={INK} strokeWidth={2.5} />
    <line x1={196} y1={-21} x2={196} y2={21} stroke={INK} strokeWidth={2.5} />
    <rect x={252} y={-19} width={26} height={38} rx={8} fill={INK} />
  </g>
);

const Pen: React.FC<{ col: Collector; scale: number }> = ({ col, scale }) => {
  const t = useT();
  const es = col.entries;
  if (es.length === 0) return null;
  let active: PenEntry | null = null;
  let prev: PenEntry | null = null;
  let next: PenEntry | null = null;
  for (const e of es) {
    if (t >= e.start && t < e.end) {
      if (!active || e.start >= active.start) active = e;
    } else if (e.end <= t) {
      if (!prev || e.end > prev.end) prev = e;
    } else if (e.start > t) {
      if (!next || e.start < next.start) next = e;
    }
  }
  const LIFT = 0.28;
  if (active) {
    const u = (t - active.start) / (active.end - active.start);
    const [x, y] = active.at(u);
    return <PenSprite x={x} y={y} o={1} scale={scale} />;
  }
  if (prev && next && next.start - prev.end <= 0.45) {
    const u = easeInOut((t - prev.end) / (next.start - prev.end));
    const a = prev.at(1);
    const b = next.at(0);
    return <PenSprite x={lerp(a[0], b[0], u)} y={lerp(a[1], b[1], u) - Math.sin(u * Math.PI) * 14} o={1} scale={scale} />;
  }
  if (prev && t - prev.end < LIFT) {
    const u = easeIn((t - prev.end) / LIFT);
    const [x, y] = prev.at(1);
    return <PenSprite x={x + 140 * u} y={y + 220 * u} o={1 - u} scale={scale} />;
  }
  if (next && next.start - t < LIFT) {
    const u = easeOut(1 - (next.start - t) / LIFT);
    const [x, y] = next.at(0);
    return <PenSprite x={x + 140 * (1 - u)} y={y + 220 * (1 - u)} o={u} scale={scale} />;
  }
  return null;
};

export const Board: React.FC<{ W: number; H: number; penScale?: number; fade?: number; children: React.ReactNode }> = ({
  W,
  H,
  penScale = 1,
  fade = 0,
  children,
}) => {
  const col: Collector = { entries: [] };
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block", background: PAPER }}>
      <defs>
        <filter id="grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={7} result="n" />
          <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -0.9 0.55" />
        </filter>
        <filter id="blotch" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.0035" numOctaves={3} seed={3} />
          <feColorMatrix type="matrix" values="0 0 0 0 0.35  0 0 0 0 0.3  0 0 0 0 0.22  0 0 0 0.9 -0.35" />
        </filter>
        <filter id="penShadow" x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation={6} />
        </filter>
      </defs>
      <rect width={W} height={H} fill={PAPER} />
      <rect width={W} height={H} filter="url(#blotch)" opacity={0.07} />
      <rect width={W} height={H} filter="url(#grain)" opacity={0.22} />
      <PenCtx.Provider value={col}>
        <MatrixCtx.Provider value={I}>{children}</MatrixCtx.Provider>
      </PenCtx.Provider>
      <Pen col={col} scale={penScale} />
      {fade > 0 && <rect width={W} height={H} fill={PAPER} opacity={fade} />}
    </svg>
  );
};
