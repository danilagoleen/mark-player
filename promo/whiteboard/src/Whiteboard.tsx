import React, { useEffect, useState } from "react";
import { Audio, Sequence, continueRender, delayRender, staticFile } from "remotion";
import { FPS, SCENES, fr, DURATION_SEC } from "./timing";
import { Board, FONT, UI_FONT, prog, useT } from "./lib/draw";
import { LAYOUTS, LayoutProvider, type Kind } from "./lib/layout";
import { S1Client } from "./scenes/S1Client";
import { S2Mark } from "./scenes/S2Mark";

export interface WhiteboardProps {
  withAudio?: boolean;
}

const VO_DELAY = 0.25;
const FADE_OUT = 1.0;

/** Load the bundled handwriting font before anything is measured or drawn. */
const useFont = () => {
  const [ready, setReady] = useState(false);
  const [handle] = useState(() => delayRender("Loading Caveat"));
  useEffect(() => {
    const faces = [
      new FontFace(FONT, `url(${staticFile("fonts/Caveat-Regular.ttf")})`, { weight: "400 600" }),
      new FontFace(FONT, `url(${staticFile("fonts/Caveat-Bold.ttf")})`, { weight: "700" }),
      new FontFace(UI_FONT, `url(${staticFile("fonts/PatrickHand-Regular.ttf")})`, { weight: "400 700" }),
    ];
    Promise.all(faces.map((f) => f.load()))
      .then((loaded) => {
        loaded.forEach((f) => document.fonts.add(f));
        setReady(true);
        continueRender(handle);
      })
      .catch((e) => {
        console.error(e);
        continueRender(handle);
        setReady(true);
      });
  }, [handle]);
  return ready;
};

const Scenes: React.FC = () => (
  <>
    <S1Client />
    <S2Mark />
  </>
);

const Fade: React.FC<{ kind: Kind; children: React.ReactNode }> = ({ kind, children }) => {
  const t = useT();
  const L = LAYOUTS[kind];
  return (
    <Board W={L.W} H={L.H} penScale={L.penScale} fade={prog(t, DURATION_SEC - FADE_OUT, FADE_OUT)}>
      {children}
    </Board>
  );
};

export const Whiteboard: React.FC<WhiteboardProps & { kind: Kind }> = ({ kind, withAudio = false }) => {
  const ready = useFont();
  return (
    <LayoutProvider value={LAYOUTS[kind]}>
      {ready && (
        <Fade kind={kind}>
          <Scenes />
        </Fade>
      )}
      {withAudio && (
        <>
          <Audio src={staticFile("music.wav")} />
          {SCENES.map((s, i) => (
            <Sequence key={s.id} from={fr(s.from + VO_DELAY)} layout="none">
              <Audio src={staticFile(`vo/vo_S${i + 1}.mp3`)} />
            </Sequence>
          ))}
        </>
      )}
    </LayoutProvider>
  );
};

export { FPS };
