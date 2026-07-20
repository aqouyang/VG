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
  return (
    <>
      <Composition
        id="LyricVideo"
        component={LyricVideo as unknown as React.FC<Record<string, unknown>>}
        durationInFrames={450}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={defaultProps as unknown as Record<string, unknown>}
      />
    </>
  );
};
