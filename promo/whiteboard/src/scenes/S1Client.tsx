import React from "react";
import { scene } from "../timing";
import { Draw, DrawSeq, G, Hand, INK, Wipe, layoutText, useT } from "../lib/draw";
import { SceneFrame, useLayout } from "../lib/layout";
import { ellipse, line, poly, rect, roundRect, smooth, type P } from "../lib/rough";

const def = scene("S1_client");

const BUBBLE_TEXT = ["fix it around minute two…", "…where the drummer kicks in."];
const TEXT_SIZE = 54;

/** Film strip: outline, then sprocket holes and frame lines wiped in. Centred at 0,0. */
export const FilmStrip: React.FC<{ w: number; h: number; at: number; seed: string; dur?: number }> = ({ w, h, at, seed, dur = 0.3 }) => {
  const x = -w / 2;
  const y = -h / 2;
  const holes: React.ReactNode[] = [];
  const nh = Math.round(w / 44);
  const hw = 14;
  const hh = 10;
  for (let i = 0; i < nh; i++) {
    const hx = x + (w / nh) * (i + 0.5) - hw / 2;
    holes.push(<rect key={`t${i}`} x={hx} y={y + 8} width={hw} height={hh} rx={3} fill={INK} />);
    holes.push(<rect key={`b${i}`} x={hx} y={y + h - 8 - hh} width={hw} height={hh} rx={3} fill={INK} />);
  }
  const frames = 3;
  const inner: React.ReactNode[] = [];
  inner.push(<path key="l1" d={line([x + 4, y + 26], [x + w - 4, y + 26], seed + "a", 1)} stroke={INK} strokeWidth={3} fill="none" strokeLinecap="round" />);
  inner.push(<path key="l2" d={line([x + 4, y + h - 26], [x + w - 4, y + h - 26], seed + "b", 1)} stroke={INK} strokeWidth={3} fill="none" strokeLinecap="round" />);
  for (let i = 1; i < frames; i++) {
    const fx = x + (w / frames) * i;
    inner.push(<path key={`f${i}`} d={line([fx, y + 26], [fx, y + h - 26], seed + "f" + i, 1)} stroke={INK} strokeWidth={3} fill="none" strokeLinecap="round" />);
  }
  const outlineDur = dur * 0.7;
  return (
    <>
      <Draw d={rect(x, y, w, h, seed, 1.8)} at={at} dur={outlineDur} w={5} />
      <Wipe at={at + outlineDur + 0.02} dur={dur * 0.3} x={x} y={y} w={w} h={h}>
        {holes}
        {inner}
      </Wipe>
    </>
  );
};

/** Bubble with a two-stroke tail ending at `tip`. Text is written after the outline. */
const Bubble: React.FC<{ x: number; y: number; w: number; h: number; tip: P; side: "right" | "left"; text: string; at: number; seed: string }> = ({
  x,
  y,
  w,
  h,
  tip,
  side,
  text,
  at,
  seed,
}) => {
  const ex = side === "right" ? x + w - 6 : x + 6;
  const cy = y + h / 2;
  const tail = poly([[ex, cy - 20], tip, [ex, cy + 18]], seed + "t", { amp: 1.2 });
  return (
    <>
      <Draw d={roundRect(x, y, w, h, 44, seed)} at={at} dur={0.34} w={5} />
      <Draw d={tail} at={at + 0.36} dur={0.1} w={5} />
      <Hand x={x + w / 2} y={cy + TEXT_SIZE * 0.32} text={text} size={TEXT_SIZE} anchor="middle" at={at + 0.48} dur={0.55} />
    </>
  );
};

/** Clock with ticks but no numbers; hands spin faster and faster. */
const Clock: React.FC<{ cx: number; cy: number; r: number; at: number }> = ({ cx, cy, r, at }) => {
  const t = useT();
  const spinFrom = at + 0.55;
  const s = Math.max(0, t - spinFrom);
  // accelerating spin: angle grows with s^1.6
  const minute = -60 + 360 * 0.55 * Math.pow(s, 1.6);
  const hour = 40 + minute / 12;
  const ticks = [0, 90, 180, 270].map((a) => {
    const rad = (a * Math.PI) / 180;
    return line([cx + Math.cos(rad) * r * 0.78, cy + Math.sin(rad) * r * 0.78], [cx + Math.cos(rad) * r * 0.9, cy + Math.sin(rad) * r * 0.9], "tick" + a, 0.5);
  });
  return (
    <>
      <Draw d={ellipse(cx, cy, r, r, "clock", { start: -1.9, over: 0.3 })} at={at} dur={0.3} w={6} />
      <DrawSeq ds={ticks} at={at + 0.3} dur={0.12} w={5} gap={0.01} />
      <G x={cx} y={cy} r={hour}>
        <Draw d={line([0, 0], [0, -r * 0.48], "hh", 0.6)} at={at + 0.43} dur={0.05} w={7} />
      </G>
      <G x={cx} y={cy} r={minute}>
        <Draw d={line([0, 0], [0, -r * 0.74], "mh", 0.6)} at={at + 0.49} dur={0.05} w={5} />
      </G>
      {t >= at + 0.43 && <circle cx={cx} cy={cy} r={7} fill={INK} />}
    </>
  );
};

/** Head-and-shoulders client. */
const Client: React.FC<{ cx: number; cy: number; at: number }> = ({ cx, cy, at }) => {
  const r = 62;
  const shoulders = smooth([
    [cx - 128, cy + 222],
    [cx - 112, cy + 140],
    [cx - 40, cy + 102],
    [cx + 40, cy + 102],
    [cx + 112, cy + 140],
    [cx + 128, cy + 222],
  ]);
  return (
    <>
      <Draw d={ellipse(cx, cy, r, r * 1.08, "head", { start: -2.6 })} at={at} dur={0.32} w={6} />
      <Draw d={shoulders} at={at + 0.34} dur={0.28} w={6} />
    </>
  );
};

export const S1Client: React.FC = () => {
  const L = useLayout();
  const wide = L.arr === "wide";
  const pad = 46;
  const bw = BUBBLE_TEXT.map((s) => layoutText(s, TEXT_SIZE, 500).width + pad * 2);
  const bh = 104;

  const C = wide
    ? {
        head: [1570, 420] as P,
        bubbleRight: [1400, 1440],
        bubbleY: [150, 318],
        tips: [[1494, 378], [1500, 424]] as P[],
        pile: [
          [420, 690, -3],
          [452, 556, 4],
          [400, 424, -4],
          [446, 294, 2.5],
        ],
        clock: [930, 620, 112] as [number, number, number],
        strip: [360, 104],
      }
    : {
        head: [840, 330] as P,
        bubbleRight: [720, 742],
        bubbleY: [110, 280],
        tips: [[770, 290], [776, 336]] as P[],
        pile: [
          [270, 1214, -3],
          [302, 1080, 4],
          [250, 948, -4],
          [296, 818, 2.5],
        ],
        clock: [760, 1010, 130] as [number, number, number],
        strip: [360, 104],
      };

  // --- schedule (s): ambient intro, the marker takes its time
  const T_CLIENT = 0.08;
  const T_B1 = 0.7;
  const T_B2 = 1.72;
  const T_PILE = 2.78;
  const PILE_EACH = 0.24;
  const T_CLOCK = T_PILE + PILE_EACH * 4 + 0.02;
  const CAPTION = T_CLOCK + 0.56; // drawing settled (the clock keeps spinning) → caption

  return (
    <SceneFrame def={def} captionAt={CAPTION}>
      <Client cx={C.head[0]} cy={C.head[1]} at={T_CLIENT} />
      {BUBBLE_TEXT.map((text, i) => (
        <Bubble
          key={i}
          x={C.bubbleRight[i] - bw[i]}
          y={C.bubbleY[i]}
          w={bw[i]}
          h={bh}
          tip={C.tips[i]}
          side="right"
          text={text}
          at={i === 0 ? T_B1 : T_B2}
          seed={"b" + i}
        />
      ))}
      {C.pile.map(([x, y, r], i) => {
        const at = T_PILE + i * PILE_EACH;
        return (
          <G key={i} x={x} y={y} r={r}>
            <FilmStrip w={C.strip[0]} h={C.strip[1]} at={at} seed={"strip" + i} dur={PILE_EACH - 0.03} />
          </G>
        );
      })}
      <Clock cx={C.clock[0]} cy={C.clock[1]} r={C.clock[2]} at={T_CLOCK} />
    </SceneFrame>
  );
};
