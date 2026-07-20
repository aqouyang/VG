import React from "react";
import { Composition, getInputProps } from "remotion";
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
  // Read input props to get dynamic duration from render.py
  const inputProps = getInputProps() as Partial<LyricVideoProps & { durationInFrames: number }>;

  const vcfg = inputProps?.visualConfig?.video ?? defaultVisualConfig.video;
  const w = vcfg?.width ?? 1920;
  const h = vcfg?.height ?? 1080;
  const fps = vcfg?.fps ?? 30;

  // Use duration from render props, or fallback to default
  const frames = (inputProps as any)?.durationInFrames ?? 450;

  return (
    <>
      <Composition
        id="LyricVideo"
        component={LyricVideo as unknown as React.FC<Record<string, unknown>>}
        durationInFrames={frames}
        fps={fps}
        width={w}
        height={h}
        defaultProps={{ ...defaultProps, ...inputProps } as unknown as Record<string, unknown>}
      />
    </>
  );
};
