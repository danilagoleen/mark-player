import React from "react";
import { Composition } from "remotion";
import { DURATION_FRAMES, FPS } from "./timing";
import { Whiteboard, type WhiteboardProps } from "./Whiteboard";
import { LAYOUTS } from "./lib/layout";

const Wide: React.FC<WhiteboardProps> = (p) => <Whiteboard kind="wide" {...p} />;
const Tall: React.FC<WhiteboardProps> = (p) => <Whiteboard kind="tall" {...p} />;
const Post: React.FC<WhiteboardProps> = (p) => <Whiteboard kind="post" {...p} />;

export const Root: React.FC = () => (
  <>
    <Composition id="Whiteboard16x9" component={Wide} durationInFrames={DURATION_FRAMES} fps={FPS} width={LAYOUTS.wide.W} height={LAYOUTS.wide.H} defaultProps={{ withAudio: false }} />
    <Composition id="Whiteboard9x16" component={Tall} durationInFrames={DURATION_FRAMES} fps={FPS} width={LAYOUTS.tall.W} height={LAYOUTS.tall.H} defaultProps={{ withAudio: false }} />
    <Composition id="Carousel4x5" component={Post} durationInFrames={DURATION_FRAMES} fps={FPS} width={LAYOUTS.post.W} height={LAYOUTS.post.H} defaultProps={{ withAudio: false }} />
  </>
);
