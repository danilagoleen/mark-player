import React from "react";
import { G as beat, scene } from "../timing";
import { Draw, G, Hand, easeIn, layoutText, lerp, prog, useT } from "../lib/draw";
import { SceneFrame, useLayout } from "../lib/layout";
import { CrossMark, Fly, Keycap, PinMark, Player, Playhead, StarMark, barX, playerDoneAt, playerGeo, track, type PlayerGeo } from "../lib/parts";
import { line, roundRect, type P } from "../lib/rough";

const def = scene("S2_mark");

export const TC = "00:01:59:10";
export const NOTE = "tighten here — on the snare";
/** Marker positions along the bar, shared with S3. */
export const POS = { pin: 0.4, star: 0.62, cross: 0.8 };

export const S2Geo = (wide: boolean) =>
  wide
    ? { g: playerGeo(150, 20, 960, 82), key: [1470, 300] as P, keySize: 190 }
    : { g: playerGeo(40, 40, 920, 82), key: [500, 1080] as P, keySize: 210 };

/** Timecode tag + note under the pin. Returns elements; `at` = start of drawing. */
export const PinNote: React.FC<{ g: PlayerGeo; wide: boolean; at: number; drawn?: boolean }> = ({ g, wide, at, drawn = true }) => {
  const t = useT();
  const px = barX(g, POS.pin);
  const tagSize = 44;
  const noteSize = 50;
  const tagW = layoutText(TC, tagSize, 600).width + 30;
  const tagH = 58;
  const tagX = wide ? px - 40 : Math.max(10, px - 150);
  const tagY = g.barY + 48;
  const noteX = wide ? tagX + tagW + 22 : tagX;
  const noteY = wide ? tagY + tagH / 2 + noteSize * 0.32 : tagY + tagH + 62;
  const conn = line([px, g.barY + 8], [px, tagY - 2], "conn", 0.6);
  if (!drawn) {
    // already-settled version (used by later scenes)
    if (t < at) return null;
  }
  const a = drawn ? at : -10;
  return (
    <>
      <Draw d={conn} at={a} dur={0.1} w={4} />
      <Draw d={roundRect(tagX, tagY, tagW, tagH, 12, "tag", 1)} at={a + 0.12} dur={0.24} w={4} />
      <Hand x={tagX + tagW / 2} y={tagY + tagH / 2 + tagSize * 0.3} text={TC} size={tagSize} weight={600} anchor="middle" at={a + 0.38} dur={0.5} />
      <Hand x={noteX} y={noteY} text={NOTE} size={noteSize} at={a + 0.95} dur={1.25} />
    </>
  );
};

export const S2Mark: React.FC = () => {
  const L = useLayout();
  const t = useT();
  const wide = L.arr === "wide";
  const { g, key, keySize } = S2Geo(wide);

  const kM = def.beats.key_M; // 7.37
  const kF = def.beats.key_F; // 14.04
  const kN = def.beats.key_N; // 15.37
  const pinLand = beat(3); // 8.04
  const starLand = beat(13); // 14.71
  const crossLand = beat(15); // 16.04

  const P0 = def.from;
  const keyMAt = playerDoneAt(P0) + 0.02;

  const ph = track(t, [
    [playerDoneAt(P0), 0.14],
    [kM, POS.pin],
    [beat(8), POS.pin],
    [kF, POS.star],
    [kN, POS.cross],
    [def.to, 0.9],
  ]);
  const phO = prog(t, playerDoneAt(P0), 0.12);

  const pinX = barX(g, POS.pin);
  const starX = barX(g, POS.star);
  const crossX = barX(g, POS.cross);
  const keyTop: P = [key[0], key[1] - keySize * 0.6];

  // pin drops from above the frame bottom onto the bar
  const dropU = prog(t, kM, pinLand - kM);
  const pinY = lerp(g.barY - 170, g.barY, easeIn(dropU));

  return (
    <SceneFrame def={def} exit="none">
      <Player g={g} at={P0} />
      {phO > 0 && <Playhead x={barX(g, ph)} y={g.barY} o={phO} />}

      <G x={key[0]} y={key[1]}>
        <Keycap letter="M" at={keyMAt} press={kM} out={beat(11) - 0.16} size={keySize} seed="kM" />
        <Keycap letter="F" at={beat(11)} press={kF} out={starLand - 0.16} size={keySize} seed="kF" />
        <Keycap letter="N" at={starLand} press={kN} out={def.to + 1} size={keySize} seed="kN" />
      </G>

      {/* M: comment pin drops on the bar, then tag + note written by hand */}
      {t >= kM && (
        <G x={pinX} y={pinY}>
          <PinMark at={kM} />
        </G>
      )}
      <PinNote g={g} wide={wide} at={pinLand + 0.02} />

      {/* F: star flies from the key onto the bar */}
      {t >= kF && (
        <Fly a={keyTop} b={[starX, g.barY]} start={kF} land={starLand} arc={wide ? 140 : 260} scaleFrom={1.6} scaleTo={1}>
          <StarMark at={kF} />
        </Fly>
      )}
      {/* N: cross flies onto the bar */}
      {t >= kN && (
        <Fly a={keyTop} b={[crossX, g.barY]} start={kN} land={crossLand} arc={wide ? 140 : 260} scaleFrom={1.6} scaleTo={1}>
          <CrossMark at={kN} />
        </Fly>
      )}
    </SceneFrame>
  );
};
