import React from "react";
import { Composition } from "remotion";
import { LyricVideo, type LyricVideoProps } from "./LyricVideo";
import { defaultVisualConfig } from "../utils/visualDefaults";

const defaultProps: LyricVideoProps = {
  projectName: "demo",
  title: "Demo Song",
  artist: "Demo Artist",
  audioFile: "song.wav",
  coverFile: "cover.png",
  lrcLines: [
    { time: 2, text: "This is a demo" },
    { time: 5, text: "Of the lyric video" },
    { time: 8, text: "Generator" },
  ],
  visualConfig: defaultVisualConfig,
};

export const RemotionRoot: React.FC = () => {
  const w = defaultVisualConfig.video?.width ?? 1920;
  const h = defaultVisualConfig.video?.height ?? 1080;
  const fps = defaultVisualConfig.video?.fps ?? 30;

  return (
    <>
      <Composition
        id="LyricVideo"
        component={LyricVideo as unknown as React.FC<Record<string, unknown>>}
        durationInFrames={450}
        fps={fps}
        width={w}
        height={h}
        defaultProps={defaultProps as unknown as Record<string, unknown>}
      />
    </>
  );
};
