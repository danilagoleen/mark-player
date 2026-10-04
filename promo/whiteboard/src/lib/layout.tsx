import React, { createContext, useContext } from "react";
import { EXIT, type SceneDef } from "../timing";
import { G, Hand, easeIn, layoutText, prog, useT } from "./draw";

export type Kind = "wide" | "tall" | "post";
/** Scenes are drawn in one of two arrangements; tall and post share "narrow". */
export type Arr = "wide" | "narrow";

export interface Layout {
  kind: Kind;
  arr: Arr;
  W: number;
  H: number;
  /** where the scene box is placed on screen */
  stage: { x: number; y: number; w: number; h: number };
  /** scene box size in design units */
  box: { w: number; h: number };
  caption: { cy: number; size: number; maxW: number };
  penScale: number;
}

export const LAYOUTS: Record<Kind, Layout> = {
  wide: {
    kind: "wide",
    arr: "wide",
    W: 1920,
    H: 1080,
    stage: { x: 60, y: 36, w: 1800, h: 800 },
    box: { w: 1800, h: 800 },
    caption: { cy: 962, size: 84, maxW: 1780 },
    penScale: 0.85,
  },
  tall: {
    kind: "tall",
    arr: "narrow",
    W: 1080,
    H: 1920,
    stage: { x: 40, y: 170, w: 1000, h: 1300 },
    box: { w: 1000, h: 1300 },
    caption: { cy: 1610, size: 96, maxW: 980 },
    penScale: 0.85,
  },
  post: {
    kind: "post",
    arr: "narrow",
    W: 1080,
    H: 1350,
    stage: { x: 40, y: 30, w: 1000, h: 1080 },
    box: { w: 1000, h: 1300 },
    caption: { cy: 1215, size: 80, maxW: 1000 },
    penScale: 0.75,
  },
};

const LayoutCtx = createContext<Layout>(LAYOUTS.wide);
export const LayoutProvider = LayoutCtx.Provider;
export const useLayout = () => useContext(LayoutCtx);

/** Maps the scene box (design units) into the stage rect, centred. */
export const Stage: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const L = useLayout();
  const s = Math.min(L.stage.w / L.box.w, L.stage.h / L.box.h);
  const x = L.stage.x + (L.stage.w - L.box.w * s) / 2;
  const y = L.stage.y + (L.stage.h - L.box.h * s) / 2;
  return (
    <G x={x} y={y} s={s}>
      {children}
    </G>
  );
};

/** Greedy word wrap by measured width. */
const wrap = (text: string, size: number, weight: number, maxW: number) => {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const cand = cur ? cur + " " + w : w;
    if (cur && layoutText(cand, size, weight).width > maxW) {
      lines.push(cur);
      cur = w;
    } else cur = cand;
  }
  if (cur) lines.push(cur);
  return lines;
};

const CAPTION_WRITE = 0.32;
const CAPTION_OUT = 0.14;

/**
 * Captions in their own band under the drawing, horizontally centred, one at a time.
 * Each is written on quickly (no marker — the marker belongs to the drawing) and
 * fades just before the next one or the scene's exit.
 */
export const Captions: React.FC<{ items: { at: number; text: string }[]; until: number }> = ({ items, until }) => {
  const L = useLayout();
  const t = useT();
  const { cy, size, maxW } = L.caption;
  const weight = 700;
  return (
    <>
      {items.map((c, i) => {
        const end = i + 1 < items.length ? items[i + 1].at : until;
        if (t < c.at || t >= end) return null;
        const o = 1 - prog(t, end - CAPTION_OUT, CAPTION_OUT);
        const lines = wrap(c.text, size, weight, maxW);
        const lh = size * 1.02;
        const y0 = cy - ((lines.length - 1) * lh) / 2 + size * 0.3;
        const per = CAPTION_WRITE / lines.length;
        return (
          <g key={i} opacity={o}>
            {lines.map((ln, k) => (
              <Hand
                key={k}
                x={L.W / 2}
                y={y0 + k * lh}
                text={ln}
                size={size}
                weight={weight}
                anchor="middle"
                at={c.at + k * per}
                dur={per}
                pen={false}
              />
            ))}
          </g>
        );
      })}
    </>
  );
};

/**
 * Scene frame: visible during [from, to); by default pans left over the last EXIT
 * seconds so the next scene starts on a clean board exactly at its `from`.
 */
export const SceneFrame: React.FC<{
  def: SceneDef;
  captionAt?: number;
  exit?: "pan" | "none";
  children: React.ReactNode;
}> = ({ def, captionAt, exit = "pan", children }) => {
  const t = useT();
  const L = useLayout();
  if (t < def.from || t >= def.to) return null;
  const items = def.captions.map((c) => ({ at: Number.isNaN(c.at) ? captionAt ?? def.from : c.at, text: c.text }));
  const u = exit === "pan" ? easeIn(prog(t, def.to - EXIT, EXIT)) : 0;
  return (
    <G x={-u * L.W * 1.1}>
      <Stage>{children}</Stage>
      <Captions items={items} until={exit === "pan" ? def.to + 1 : def.to} />
    </G>
  );
};
