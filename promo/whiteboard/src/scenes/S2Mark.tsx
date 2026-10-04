import React from "react";
import { G as beat, scene } from "../timing";
import { G, useT } from "../lib/draw";
import { SceneFrame, useLayout } from "../lib/layout";
import { Fly, Keycap, track } from "../lib/parts";
import {
  AppWindow,
  CLIP_SEC,
  CommentsPanel,
  DrumKit,
  Icon,
  Toolbar,
  Transport,
  secOf,
  toolbarButton,
  trackX,
  transportDone,
  transportGeo,
  type MarkKind,
  type WinGeo,
} from "../lib/ui";
import type { P } from "../lib/rough";

const def = scene("S2_mark");

export const TC = "00:01:59:10";
export const NOTE = "tighten here — on the snare";
export const FILE_TITLE = "drums_take_03.mov";
/** Where the marks sit on the clip (0..1). The comment is exactly at TC. */
export const POS: Record<"comment" | "star" | "neg", number> = {
  comment: secOf(TC) / CLIP_SEC,
  star: 135 / CLIP_SEC,
  neg: 150 / CLIP_SEC,
};

export const S2Geo = (wide: boolean) => {
  if (wide) {
    const win: WinGeo = { x: 10, y: 20, w: 1240, h: 744, bar: 46 };
    return {
      win,
      tbY: win.y + win.bar + 18,
      tr: transportGeo(win.x + 30, win.y + win.h - 22 - 112, win.w - 60),
      drum: { cx: win.x + win.w / 2, by: 598, s: 1.0 },
      panel: { x: 1300, y: 20, w: 490, h: 300, bar: 46 } as WinGeo,
      key: [1545, 575] as P,
      keySize: 180,
    };
  }
  const win: WinGeo = { x: 0, y: 20, w: 1000, h: 606, bar: 44 };
  return {
    win,
    tbY: win.y + win.bar + 14,
    tr: transportGeo(win.x + 18, win.y + win.h - 16 - 104, win.w - 36, 104, 24),
    drum: { cx: 500, by: 474, s: 0.74 },
    panel: { x: 40, y: 680, w: 920, h: 290, bar: 44 } as WinGeo,
    key: [500, 1150] as P,
    keySize: 180,
  };
};

export const S2Mark: React.FC = () => {
  const L = useLayout();
  const t = useT();
  const wide = L.arr === "wide";
  const { win, tbY, tr, drum, panel, key, keySize } = S2Geo(wide);

  const kM = def.beats.key_M; // 7.37
  const kF = def.beats.key_F; // 14.04
  const kN = def.beats.key_N; // 15.37
  const lands: Record<"comment" | "star" | "neg", [number, number]> = {
    comment: [kM, beat(3)], // lands 8.04
    star: [kF, beat(13)], // 14.71
    neg: [kN, beat(15)], // 16.04
  };

  const P0 = def.from;
  const trAt = P0 + 0.26;
  const tbAt = P0 + 0.46;
  const headAt = transportDone(trAt, 0.55);
  const keyMAt = 6.88;
  const panelAt = lands.comment[1] + 0.02;
  const entryAt = panelAt + 0.9;
  const drumAt = 10.9;

  const p = track(t, [
    [headAt, 0.6],
    [kM, POS.comment],
    [beat(8), POS.comment],
    [kF, POS.star],
    [kN, POS.neg],
    [def.to, 0.87],
  ]);

  // The mark leaves its toolbar button on the key press and drops onto the marker row.
  const flight = (kind: "comment" | "star" | "neg") => {
    const [start, land] = lands[kind];
    if (t < start) return null;
    const from = toolbarButton(win.x + win.w / 2, tbY, kind as MarkKind);
    const to: P = [trackX(tr, POS[kind]), tr.iconY];
    return (
      <Fly key={kind} a={from} b={to} start={start} land={land} arc={-20} scaleFrom={2.2} scaleTo={1}>
        <Icon kind={kind as MarkKind} s={kind === "star" ? 30 : 28} />
      </Fly>
    );
  };

  return (
    <SceneFrame def={def} exit="none">
      <AppWindow g={win} title={FILE_TITLE} at={P0} dur={0.3} k={0.5} seed="mainwin" />
      <Toolbar
        cx={win.x + win.w / 2}
        y={tbY}
        at={tbAt}
        k={0.5}
        press={{ comment: [kM], star: [kF], neg: [kN] }}
        badge={[[lands.comment[1], 1]]}
      />
      <Transport g={tr} at={trAt} k={0.55} p={p} showHeadAt={headAt} />
      <DrumKit cx={drum.cx} by={drum.by} s={drum.s} at={drumAt} />

      <G x={key[0]} y={key[1]}>
        <Keycap letter="M" at={keyMAt} press={kM} out={beat(11) - 0.16} size={keySize} seed="kM" />
        <Keycap letter="F" at={beat(11)} press={kF} out={lands.star[1] - 0.16} size={keySize} seed="kF" />
        <Keycap letter="N" at={lands.star[1]} press={kN} out={def.to + 1} size={keySize} seed="kN" />
      </G>

      {flight("comment")}
      {flight("star")}
      {flight("neg")}

      <CommentsPanel g={panel} at={panelAt} k={0.5} entries={[{ tc: TC, text: NOTE, at: entryAt }]} textSize={wide ? 40 : 44} />
    </SceneFrame>
  );
};

