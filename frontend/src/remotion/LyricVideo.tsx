import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  staticFile,
} from "remotion";
import type { VisualConfig } from "../types";
import { computeLayout } from "../utils/layout";
import { defaultVisualConfig } from "../utils/visualDefaults";

interface LrcLine {
  time: number;
  text: string;
}

export interface LyricVideoProps {
  projectName: string;
  title: string;
  artist: string;
  audioFile: string;
  coverFile: string;
  lrcLines: LrcLine[];
  visualConfig?: VisualConfig;
  // kept for backwards compat with render-props
  waveformData?: { duration: number };
}

export const LyricVideo: React.FC<LyricVideoProps> = ({
  projectName,
  title,
  artist,
  audioFile,
  coverFile,
  lrcLines,
  visualConfig,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const currentTime = frame / fps;
  const cfg = visualConfig ?? defaultVisualConfig;
  const layout = computeLayout(cfg, width, height);
  const s = Math.min(width / 1920, height / 1080);

  // Find active lyric line
  let activeLine = -1;
  for (let i = lrcLines.length - 1; i >= 0; i--) {
    if (currentTime >= lrcLines[i].time) {
      activeLine = i;
      break;
    }
  }

  // Entrance animations
  const coverScale = spring({ frame, fps, config: { damping: 12, stiffness: 80 } });
  const coverOpacity = interpolate(frame, [0, fps * 0.8], [0, 1], { extrapolateRight: "clamp" });
  const titleOpacity = interpolate(frame, [fps * 0.6, fps * 1.6], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const titleSlide = interpolate(frame, [fps * 0.6, fps * 1.6], [20, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const lyricsOpacity = interpolate(frame, [fps * 1.0, fps * 2.0], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const audioSrc = staticFile(`projects/${projectName}/audio/${audioFile}`);
  const coverSrc = staticFile(`projects/${projectName}/assets/${coverFile}`);

  const shadowAlpha = cfg.cover.shadowIntensity;

  return (
    <AbsoluteFill style={{ backgroundColor: cfg.background.type === "solid" ? cfg.background.solidColor : "#0a0a0f" }}>
      <Audio src={audioSrc} />

      {/* Background layer */}
      {cfg.background.type === "blurred-cover" && (
        <Img
          src={coverSrc}
          style={{
            position: "absolute",
            width: width + 160,
            height: height + 160,
            top: -80,
            left: -80,
            objectFit: "cover",
            filter: layout.bg.filter,
          }}
        />
      )}
      {cfg.background.type === "gradient" && (
        <AbsoluteFill style={layout.bg.bgStyle} />
      )}

      {/* Overlay */}
      {cfg.background.overlayOpacity > 0 && (
        <AbsoluteFill style={layout.bg.overlayStyle as React.CSSProperties} />
      )}

      {/* Album cover */}
      <div
        style={{
          position: "absolute",
          left: layout.cover.x,
          top: layout.cover.y,
          width: layout.cover.size,
          height: layout.cover.size,
          borderRadius: layout.cover.radius,
          overflow: "hidden",
          boxShadow: `0 ${24 * s}px ${80 * s}px rgba(0,0,0,${shadowAlpha}), 0 ${8 * s}px ${24 * s}px rgba(0,0,0,${shadowAlpha * 0.7})`,
          transform: `scale(${coverScale})`,
          opacity: coverOpacity,
        }}
      >
        <Img src={coverSrc} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>

      {/* Title & artist */}
      <div
        style={{
          position: "absolute",
          left: layout.title.textAlign === "right"
            ? undefined
            : layout.title.textAlign === "center"
              ? 0
              : layout.title.x,
          right: layout.title.textAlign === "right" ? width - layout.title.x : undefined,
          top: layout.title.y,
          width: layout.title.textAlign === "center" ? width : layout.cover.size,
          textAlign: layout.title.textAlign as React.CSSProperties["textAlign"],
          opacity: titleOpacity * cfg.title.opacity,
          transform: `translateY(${titleSlide}px)`,
        }}
      >
        <div
          style={{
            color: cfg.title.color,
            fontSize: cfg.title.fontSize * s,
            fontWeight: cfg.title.fontWeight,
            fontFamily: cfg.title.fontFamily,
            letterSpacing: -0.3,
            lineHeight: 1.3,
          }}
        >
          {title}
        </div>
        <div
          style={{
            color: cfg.artist.color,
            fontSize: cfg.artist.fontSize * s,
            fontWeight: cfg.artist.fontWeight,
            fontFamily: cfg.artist.fontFamily,
            marginTop: cfg.artist.offsetY * s,
            opacity: cfg.artist.opacity,
          }}
        >
          {artist}
        </div>
      </div>

      {/* Scrolling lyrics */}
      <div
        style={{
          position: "absolute",
          left: layout.lyrics.x,
          top: layout.lyrics.y,
          width: layout.lyrics.w,
          height: layout.lyrics.h,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          overflow: "hidden",
          opacity: lyricsOpacity,
        }}
      >
        {lrcLines.map((line, i) => {
          const diff = i - activeLine;
          if (Math.abs(diff) > cfg.lyrics.visibleLines) return null;

          const isActive = i === activeLine;
          const isPast = diff < 0;

          const targetY = diff * cfg.lyrics.lineSpacing * s;

          const lineOpacity = isActive
            ? interpolate(
                currentTime,
                [line.time, line.time + cfg.lyrics.scrollSpeed * 0.7],
                [0.5, 1],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
              )
            : isPast
              ? cfg.lyrics.inactiveOpacity
              : cfg.lyrics.futureOpacity;

          const lineScale = isActive
            ? interpolate(
                currentTime,
                [line.time, line.time + cfg.lyrics.scrollSpeed],
                [0.95, 1],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
              )
            : 1;

          const fontSize = isActive
            ? cfg.lyrics.activeFontSize * s
            : cfg.lyrics.inactiveFontSize * s;

          return (
            <div
              key={i}
              style={{
                position: "absolute",
                top: "50%",
                left: 0,
                right: 0,
                transform: `translateY(${targetY - fontSize / 2}px) scale(${lineScale})`,
                transformOrigin: `${cfg.lyrics.textAlign} center`,
                color: isActive ? cfg.lyrics.activeColor : "#ffffff",
                fontSize,
                fontWeight: isActive ? cfg.lyrics.activeWeight : 400,
                opacity: lineOpacity,
                fontFamily: cfg.lyrics.fontFamily,
                lineHeight: 1.5,
                textAlign: cfg.lyrics.textAlign as React.CSSProperties["textAlign"],
              }}
            >
              {line.text}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
