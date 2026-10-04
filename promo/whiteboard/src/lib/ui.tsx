// Mark Player's real interface, redrawn by hand: window, floating toolbar
// (★ ⊗ [ ] comments), transport bar with ruler and marker icons, Comments panel,
// menus. Shapes follow the app (see promo v4 frames); nothing is invented.
import React from "react";
import { Draw, DrawSeq, G, Hand, INK, PAPER, UI_FONT, Wipe, layoutText, prog, useT } from "./draw";
import { arc, ellipse, line, poly, roundRect, smooth, starFill, type P } from "./rough";

const W_MAIN = 6;
const W_DETAIL = 4;

/* --------------------------------------------------------------- timecode */

export const CLIP_SEC = 180 + 21 / 50; // 00:03:00:21 at 50 fps
export const tcOf = (sec: number, fps = 50) => {
  const f = Math.max(0, Math.round(sec * fps));
  const ff = f % fps;
  const s = Math.floor(f / fps);
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${p2(Math.floor(s / 3600))}:${p2(Math.floor(s / 60) % 60)}:${p2(s % 60)}:${p2(ff)}`;
};
/** "00:01:59:10" → seconds at 50 fps */
export const secOf = (tc: string, fps = 50) => {
  const [h, m, s, f] = tc.split(":").map(Number);
  return h * 3600 + m * 60 + s + f / fps;
};

/* ------------------------------------------------------------------ icons */

export type MarkKind = "star" | "neg" | "comment" | "in" | "out";

/** Marker icon centred at 0,0 (as on the app's timeline and toolbar). */
export const Icon: React.FC<{ kind: MarkKind; s?: number; color?: string }> = ({ kind, s = 26, color = INK }) => {
  const sw = Math.max(2.5, s * 0.13);
  const st = { stroke: color, strokeWidth: sw, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (kind === "star") return <path d={starFill(0, s * 0.04, s * 0.52)} fill={color} stroke={color} strokeWidth={sw * 0.5} strokeLinejoin="round" />;
  if (kind === "neg") {
    const r = s * 0.46;
    const k = r * 0.42;
    return (
      <g {...st}>
        <path d={ellipse(0, 0, r, r, "negc" + s, { over: 0.15, amp: 0.01 })} />
        <path d={line([-k, -k], [k, k], "negx1", 0.3)} />
        <path d={line([k, -k], [-k, k], "negx2", 0.3)} />
      </g>
    );
  }
  if (kind === "comment") {
    const w = s * 0.86;
    const h = s * 0.62;
    return (
      <g {...st}>
        <path d={roundRect(-w / 2, -h / 2 - s * 0.06, w, h, s * 0.12, "cmt" + s, 0.4)} />
        <path d={poly([[-w * 0.28, h / 2 - s * 0.06], [-w * 0.36, h / 2 + s * 0.22], [-w * 0.06, h / 2 - s * 0.06]], "cmtt", { amp: 0.3 })} />
      </g>
    );
  }
  // [ and ]
  const d = kind === "in" ? 1 : -1;
  const hh = s * 0.5;
  const ww = s * 0.22;
  return (
    <path
      {...st}
      strokeWidth={sw * 1.1}
      d={poly(
        [
          [d * ww * 0.5, -hh],
          [-d * ww * 0.5, -hh],
          [-d * ww * 0.5, hh],
          [d * ww * 0.5, hh],
        ],
        "br" + kind,
        { amp: 0.3 },
      )}
    />
  );
};

/** Icon that is drawn on with a short wipe (marker scribbles over it). */
export const DrawnIcon: React.FC<{ kind: MarkKind; x: number; y: number; s?: number; at: number; dur?: number }> = ({ kind, x, y, s = 26, at, dur = 0.12 }) => (
  <Wipe at={at} dur={dur} x={x - s * 0.7} y={y - s * 0.7} w={s * 1.4} h={s * 1.4} rows={1}>
    <G x={x} y={y}>
      <Icon kind={kind} s={s} />
    </G>
  </Wipe>
);

/* ----------------------------------------------------------------- window */

export interface WinGeo {
  x: number;
  y: number;
  w: number;
  h: number;
  bar: number;
}

/** macOS-style window: rounded frame, title-bar rule, three lights, centred title. */
export const AppWindow: React.FC<{ g: WinGeo; title: string; at: number; dur?: number; seed: string; titleSize?: number; fill?: boolean; k?: number }> = ({
  g,
  title,
  at,
  dur = 0.5,
  seed,
  titleSize = 26,
  fill = false,
  k = 1,
}) => {
  const t = useT();
  const lightsAt = at + dur + 0.02;
  const lights = [0, 1, 2].map((i) => ellipse(g.x + 30 + i * 26, g.y + g.bar / 2, 8, 8, seed + "l" + i, { over: 0.2, amp: 0.02 }));
  return (
    <>
      {fill && t >= at && <rect x={g.x} y={g.y} width={g.w} height={g.h} rx={18} fill={PAPER} opacity={Math.min(1, prog(t, at, 0.12))} />}
      <Draw d={roundRect(g.x, g.y, g.w, g.h, 18, seed + "win", 1.6)} at={at} dur={dur} w={W_MAIN} />
      <Draw d={line([g.x + 4, g.y + g.bar], [g.x + g.w - 4, g.y + g.bar], seed + "bar", 1)} at={lightsAt} dur={0.14 * k} w={W_DETAIL} />
      <DrawSeq ds={lights} at={lightsAt + 0.15 * k} dur={0.15 * k} w={W_DETAIL} gap={0.01} />
      <Hand x={g.x + g.w / 2} y={g.y + g.bar / 2 + titleSize * 0.33} text={title} size={titleSize} font={UI_FONT} anchor="middle" at={lightsAt + 0.32 * k} dur={0.3 * k} />
    </>
  );
};
export const appWindowDone = (at: number, dur = 0.5, k = 1) => at + dur + 0.02 + 0.62 * k;

/* ---------------------------------------------------------------- toolbar */

export const TOOLBAR_KINDS: MarkKind[] = ["star", "neg", "in", "out", "comment"];
export const TB = { r: 25, gap: 64, h: 66 };

export const toolbarButton = (cx: number, y: number, kind: MarkKind): P => {
  const i = TOOLBAR_KINDS.indexOf(kind);
  const x0 = cx - (TB.gap * (TOOLBAR_KINDS.length - 1)) / 2;
  return [x0 + i * TB.gap, y + TB.h / 2];
};

/** Floating toolbar pill. `press` maps a button to the times it is pressed (it lights up). */
export const Toolbar: React.FC<{ cx: number; y: number; at: number; press?: Partial<Record<MarkKind, number[]>>; badge?: [number, number][]; k?: number }> = ({
  cx,
  y,
  at,
  press = {},
  badge = [],
  k = 1,
}) => {
  const t = useT();
  const w = TB.gap * TOOLBAR_KINDS.length + 16;
  const pill = roundRect(cx - w / 2, y, w, TB.h, TB.h / 2, "tbpill", 1);
  const badgeNow = [...badge].reverse().find(([bt]) => t >= bt);
  return (
    <>
      <Draw d={pill} at={at} dur={0.32 * k} w={W_DETAIL + 0.5} />
      {TOOLBAR_KINDS.map((kind, i) => {
        const [bx, by] = toolbarButton(cx, y, kind);
        const bAt = at + (0.34 + i * 0.09) * k;
        const hits = press[kind] ?? [];
        const lit = hits.reduce((m, ht) => Math.max(m, t >= ht ? 1 - prog(t, ht + 0.12, 0.35) : 0), 0);
        return (
          <React.Fragment key={kind}>
            {lit > 0 && <circle cx={bx} cy={by} r={TB.r + 3} fill={INK} opacity={0.22 * lit} />}
            <Draw d={ellipse(bx, by, TB.r, TB.r, "tb" + kind, { over: 0.2, amp: 0.012 })} at={bAt} dur={0.07 * k} w={3} />
            <DrawnIcon kind={kind} x={bx} y={by} s={24} at={bAt + 0.07 * k} dur={0.04 * k} />
          </React.Fragment>
        );
      })}
      {badgeNow && (
        <G x={toolbarButton(cx, y, "comment")[0] + 20} y={y + 10}>
          <circle r={13} fill={INK} />
          <text y={7} textAnchor="middle" fontFamily={UI_FONT} fontSize={21} fill={PAPER}>
            {badgeNow[1]}
          </text>
        </G>
      )}
    </>
  );
};

/* -------------------------------------------------------------- transport */

export interface TransportGeo {
  x: number;
  y: number;
  w: number;
  h: number;
  trackX0: number;
  trackX1: number;
  trackY: number;
  iconY: number;
  labelY: number;
  tcSize: number;
}

export const transportGeo = (x: number, y: number, w: number, h = 112, tcSize = 28): TransportGeo => {
  const tcW = layoutText("00:00:00:00", tcSize, 400, UI_FONT).width;
  const trackX0 = x + 92 + tcW + 26;
  const trackX1 = x + w - tcW - 80;
  return { x, y, w, h, trackX0, trackX1, trackY: y + h - 30, iconY: y + h - 60, labelY: y + 30, tcSize };
};
export const trackX = (g: TransportGeo, p: number) => g.trackX0 + (g.trackX1 - g.trackX0) * p;

/** Bottom bar: ▶, current timecode, ruler, marker row, track + playhead, total, volume. */
export const Transport: React.FC<{ g: TransportGeo; at: number; p: number; showHeadAt: number; clipSec?: number; labelStep?: number; k?: number }> = ({
  g,
  at,
  p,
  showHeadAt,
  clipSec = CLIP_SEC,
  labelStep = 30,
  k = 1,
}) => {
  const t = useT();
  const cy = g.y + g.h / 2;
  const playC: P = [g.x + 52, cy];
  const tri = poly(
    [
      [playC[0] - 8, cy - 12],
      [playC[0] + 13, cy],
      [playC[0] - 8, cy + 12],
    ],
    "play",
    { closed: true, amp: 0.4 },
  );
  const labels: { x: number; s: string }[] = [];
  for (let s = 0; s <= clipSec; s += labelStep) labels.push({ x: trackX(g, s / clipSec), s: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` });
  const spk: P = [g.x + g.w - 38, cy];
  const head = prog(t, showHeadAt, 0.12);
  const curTc = tcOf(p * clipSec);
  return (
    <>
      <Draw d={roundRect(g.x, g.y, g.w, g.h, g.h / 2, "trpill", 1.2)} at={at} dur={0.4 * k} w={W_DETAIL + 0.5} />
      <Draw d={ellipse(playC[0], cy, 28, 28, "playc", { over: 0.2 })} at={at + 0.42 * k} dur={0.12 * k} w={W_DETAIL} />
      <Draw d={tri} at={at + 0.55 * k} dur={0.1 * k} w={W_DETAIL} fill />
      <Draw d={line([g.trackX0, g.trackY], [g.trackX1, g.trackY], "track", 0.8)} at={at + 0.68 * k} dur={0.22 * k} w={W_DETAIL} />
      <Wipe at={at + 0.9 * k} dur={0.24 * k} x={g.trackX0 - 30} y={g.labelY - 22} w={g.trackX1 - g.trackX0 + 60} h={30} rows={1}>
        {labels.map((l) => (
          <text key={l.s} x={l.x} y={g.labelY} textAnchor="middle" fontFamily={UI_FONT} fontSize={22} fill={INK} opacity={0.75}>
            {l.s}
          </text>
        ))}
      </Wipe>
      <Hand x={g.x + 92} y={cy + g.tcSize * 0.32} text={t >= at + 1.42 * k ? curTc : tcOf(0)} size={g.tcSize} font={UI_FONT} at={at + 1.16 * k} dur={0.26 * k} />
      <Hand x={g.x + g.w - 72} y={cy + g.tcSize * 0.32} text={tcOf(clipSec)} size={g.tcSize} font={UI_FONT} anchor="end" at={at + 1.16 * k} dur={0.01 * k} pen={false} />
      <Wipe at={at + 1.44 * k} dur={0.12 * k} x={spk[0] - 18} y={cy - 18} w={40} h={36} rows={1}>
        <g stroke={INK} strokeWidth={3.5} fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d={poly([[spk[0] - 14, cy - 6], [spk[0] - 6, cy - 6], [spk[0] + 3, cy - 14], [spk[0] + 3, cy + 14], [spk[0] - 6, cy + 6], [spk[0] - 14, cy + 6]], "spk", { closed: true, amp: 0.3 })} />
          <path d={arc(spk[0] + 6, cy, 8, 9, -0.9, 0.9, "spk1")} />
          <path d={arc(spk[0] + 6, cy, 15, 16, -0.9, 0.9, "spk2")} />
        </g>
      </Wipe>
      {head > 0 && <circle cx={trackX(g, p)} cy={g.trackY} r={11 * head} fill={INK} />}
    </>
  );
};
export const transportDone = (at: number, k = 1) => at + 1.58 * k;

/* --------------------------------------------------------------- comments */

export interface CommentEntry {
  tc: string;
  text: string;
  at: number;
}

/** The app's Comments window: title, "Comments" + "Clear all", entries with ✎ and 🗑. */
export const CommentsPanel: React.FC<{ g: WinGeo; at: number; entries: CommentEntry[]; textSize?: number; k?: number }> = ({ g, at, entries, textSize = 40, k = 1 }) => {
  const headY = g.y + g.bar + 46;
  const clearW = layoutText("Clear all", 24, 400, UI_FONT).width + 30;
  const rowTop = headY + 26;
  const rowH = 118;
  const hAt = appWindowDone(at, 0.4 * k, k);
  return (
    <>
      <AppWindow g={g} title="Comments" at={at} dur={0.4 * k} seed="cpw" fill k={k} />
      <Hand x={g.x + 26} y={headY} text="Comments" size={30} weight={700} font={UI_FONT} at={hAt} dur={0.22} />
      <Draw d={roundRect(g.x + g.w - 26 - clearW, headY - 30, clearW, 40, 14, "clear", 0.6)} at={hAt + 0.24} dur={0.14} w={3} />
      <Hand x={g.x + g.w - 26 - clearW / 2} y={headY - 2} text="Clear all" size={24} font={UI_FONT} anchor="middle" at={hAt + 0.38} dur={0.12} pen={false} />
      {entries.map((e, i) => {
        const y = rowTop + i * rowH;
        return (
          <React.Fragment key={i}>
            <Draw d={line([g.x + 6, y], [g.x + g.w - 6, y], "row" + i, 0.6)} at={e.at} dur={0.1} w={2.5} />
            <Hand x={g.x + 26} y={y + 40} text={e.tc} size={26} font={UI_FONT} at={e.at + 0.12} dur={0.4} o={0.7} />
            <Hand x={g.x + 26} y={y + 40 + textSize * 1.05} text={e.text} size={textSize} at={e.at + 0.56} dur={Math.max(0.6, e.text.length * 0.045)} />
            <PencilTrash x={g.x + g.w - 84} y={y + 32} at={e.at + 0.56 + Math.max(0.6, e.text.length * 0.045) + 0.04} />
          </React.Fragment>
        );
      })}
    </>
  );
};

const PencilTrash: React.FC<{ x: number; y: number; at: number }> = ({ x, y, at }) => (
  <Wipe at={at} dur={0.14} x={x - 18} y={y - 22} w={84} h={44} rows={1}>
    <g stroke={INK} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d={poly([[x - 12, y + 14], [x - 10, y + 6], [x + 8, y - 14], [x + 14, y - 8], [x - 4, y + 12], [x - 12, y + 14]], "pencil", { amp: 0.3 })} />
      <path d={poly([[x + 34, y - 10], [x + 60, y - 10]], "tr1", { amp: 0.2 })} />
      <path d={poly([[x + 37, y - 8], [x + 39, y + 14], [x + 55, y + 14], [x + 57, y - 8]], "tr2", { amp: 0.3 })} />
      <path d={poly([[x + 42, y - 15], [x + 52, y - 15]], "tr3", { amp: 0.2 })} />
    </g>
  </Wipe>
);

/* ------------------------------------------------------------------ video */

/** A loose sketch of a drum kit for the video area (the footage in the brief is a drummer). */
export const DrumKit: React.FC<{ cx: number; by: number; s: number; at: number; dur?: number }> = ({ cx, by, s, at, dur = 0.9 }) => {
  const S = (x: number, y: number): P => [cx + x * s, by + y * s];
  const ds = [
    ellipse(...S(0, -95), 92 * s, 92 * s, "kick", { over: 0.2 }),
    ellipse(...S(0, -95), 30 * s, 30 * s, "kicklogo", { over: 0.1 }),
    // snare
    ellipse(...S(-150, -150), 62 * s, 16 * s, "snareT", { over: 0.15 }),
    smooth([S(-212, -150), S(-210, -112), S(-150, -98), S(-90, -112), S(-88, -150)]),
    line(S(-150, -98), S(-150, 0), "snareStand"),
    // rack tom
    ellipse(...S(-30, -228), 48 * s, 14 * s, "tomT", { over: 0.15 }),
    smooth([S(-78, -228), S(-76, -190), S(-30, -178), S(16, -190), S(18, -228)]),
    // floor tom
    ellipse(...S(160, -140), 66 * s, 18 * s, "floorT", { over: 0.15 }),
    smooth([S(94, -140), S(96, -60), S(160, -46), S(224, -60), S(226, -140)]),
    // hi-hat
    ellipse(...S(-270, -232), 56 * s, 9 * s, "hh1", { over: 0.1 }),
    ellipse(...S(-270, -218), 56 * s, 9 * s, "hh2", { over: 0.1 }),
    line(S(-270, -210), S(-270, 0), "hhStand"),
    // crash
    ellipse(...S(150, -300), 82 * s, 16 * s, "crash", { over: 0.12 }),
    line(S(150, -286), S(190, 0), "crashStand"),
  ];
  return <DrawSeq ds={ds} at={at} dur={dur} w={3.5} gap={0.01} />;
};
