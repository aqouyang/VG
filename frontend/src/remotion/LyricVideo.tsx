import React from "react";
import {
  AbsoluteFill, Audio, Img, useCurrentFrame, useVideoConfig,
  interpolate, spring, staticFile,
} from "remotion";
import type { VisualConfig, LyricAnimationConfig } from "../types";
import { computeLayout } from "../utils/layout";
import { defaultVisualConfig } from "../utils/visualDefaults";
import { computeLyricState } from "../utils/lyricState";

interface LrcLine { time: number; text: string; }

export interface LyricVideoProps {
  projectName: string;
  title: string;
  artist: string;
  audioFile: string;
  coverFile: string;
  lrcLines: LrcLine[];
  visualConfig?: VisualConfig;
  waveformData?: { duration: number };
}

function ColoredText({ text, progress, activeColor, baseColor, style }: {
  text: string; progress: number; activeColor: string; baseColor: string;
  style: React.CSSProperties;
}) {
  if (progress <= 0) return <div style={{ ...style, color: baseColor }}>{text}</div>;
  if (progress >= 1) return <div style={{ ...style, color: activeColor }}>{text}</div>;
  const chars = [...text];
  const n = Math.floor(progress * chars.length);
  return (
    <div style={style}>
      {chars.map((ch, i) => (
        <span key={i} style={{ color: i < n ? activeColor : baseColor }}>{ch}</span>
      ))}
    </div>
  );
}

export const LyricVideo: React.FC<LyricVideoProps> = ({
  projectName, title, artist, audioFile, coverFile, lrcLines, visualConfig,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const currentTime = frame / fps;
  const cfg = visualConfig ?? defaultVisualConfig;
  const layout = computeLayout(cfg, width, height);
  const s = Math.min(width / 1920, height / 1080);
  const anim: LyricAnimationConfig = cfg.lyricAnimation ?? {
    enabled: false, activeColor: "#6c5ce7", completedColor: "#888",
    inactiveColor: "#fff", colorMode: "current-line", transitionDuration: 2,
  };

  // Shared lyric state
  const lyricState = computeLyricState(currentTime, lrcLines, cfg, s);
  const spacing = cfg.lyrics.lineSpacing * s;

  // Entrance animations
  const coverScale = spring({ frame, fps, config: { damping: 12, stiffness: 80 } });
  const coverOpacity = interpolate(frame, [0, fps * 0.8], [0, 1], { extrapolateRight: "clamp" });
  const titleOpacity = interpolate(frame, [fps * 0.6, fps * 1.6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const titleSlide = interpolate(frame, [fps * 0.6, fps * 1.6], [20, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const lyricsOpacity = interpolate(frame, [fps * 1.0, fps * 2.0], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const audioSrc = staticFile(`projects/${projectName}/audio/${audioFile}`);
  const coverSrc = staticFile(`projects/${projectName}/assets/${coverFile}`);
  const shadowAlpha = cfg.cover.shadowIntensity;

  // Scroll offset: position active line at vertical center of container.
  // Clamp so content never scrolls completely out of view.
  const activeIdx = lyricState.activeLine;
  const totalH = lrcLines.length * spacing;
  let targetY = activeIdx >= 0 ? activeIdx * spacing + spacing / 2 : 0;
  const maxScroll = Math.max(0, totalH - layout.lyrics.h / 2);
  targetY = Math.max(0, Math.min(targetY, maxScroll));
  const scrollTranslateY = layout.lyrics.h / 2 - targetY;

  return (
    <AbsoluteFill style={{ backgroundColor: cfg.background.type === "solid" ? cfg.background.solidColor : "#0a0a0f" }}>
      <Audio src={audioSrc} />
      {cfg.background.type === "blurred-cover" && (
        <Img src={coverSrc} style={{ position: "absolute", width: width + 160, height: height + 160, top: -80, left: -80, objectFit: "cover", filter: layout.bg.filter }} />
      )}
      {cfg.background.type === "gradient" && <AbsoluteFill style={layout.bg.bgStyle} />}
      {cfg.background.overlayOpacity > 0 && <AbsoluteFill style={layout.bg.overlayStyle as React.CSSProperties} />}

      {/* Cover */}
      <div style={{
        position: "absolute", left: layout.cover.x, top: layout.cover.y,
        width: layout.cover.size, height: layout.cover.size,
        borderRadius: layout.cover.radius, overflow: "hidden",
        boxShadow: `0 ${24 * s}px ${80 * s}px rgba(0,0,0,${shadowAlpha})`,
        transform: `scale(${coverScale})`, opacity: coverOpacity,
      }}>
        <Img src={coverSrc} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>

      {/* Title */}
      <div style={{
        position: "absolute",
        left: layout.title.textAlign === "right" ? undefined : layout.title.textAlign === "center" ? 0 : layout.title.x,
        right: layout.title.textAlign === "right" ? width - layout.title.x : undefined,
        top: layout.title.y,
        width: layout.title.textAlign === "center" ? width : layout.cover.size,
        textAlign: layout.title.textAlign as any,
        opacity: titleOpacity * cfg.title.opacity, transform: `translateY(${titleSlide}px)`,
      }}>
        <div style={{ color: cfg.title.color, fontSize: cfg.title.fontSize * s, fontWeight: cfg.title.fontWeight, fontFamily: cfg.title.fontFamily, letterSpacing: -0.3, lineHeight: 1.3 }}>{title}</div>
        <div style={{ color: cfg.artist.color, fontSize: cfg.artist.fontSize * s, fontWeight: cfg.artist.fontWeight, fontFamily: cfg.artist.fontFamily, marginTop: cfg.artist.offsetY * s, opacity: cfg.artist.opacity }}>{artist}</div>
      </div>

      {/* Lyrics */}
      <div style={{
        position: "absolute", left: layout.lyrics.x, top: layout.lyrics.y,
        width: layout.lyrics.w, height: layout.lyrics.h,
        overflow: "hidden", opacity: lyricsOpacity,
      }}>
        <div style={{ transform: `translateY(${scrollTranslateY}px)` }}>
          {lyricState.lines.map(line => {
            if (line.opacity <= 0) return <div key={line.index} style={{ height: spacing }} />;
            const fontSize = line.fontSize;
            const lineColor = !anim.enabled ? (line.isActive ? cfg.lyrics.activeColor : "#fff")
              : line.isPast ? anim.completedColor : anim.inactiveColor;
            const baseStyle: React.CSSProperties = {
              fontSize, fontWeight: line.fontWeight, fontFamily: cfg.lyrics.fontFamily,
              lineHeight: 1.5, letterSpacing: (cfg.lyrics.letterSpacing ?? 0) * s,
              textAlign: cfg.lyrics.textAlign as any, whiteSpace: "pre-wrap", width: "100%",
            };

            return (
              <div key={line.index} style={{
                minHeight: spacing, display: "flex", alignItems: "center",
                opacity: line.opacity,
              }}>
                {anim.enabled && line.isActive && line.fillProgress > 0 ? (
                  <ColoredText text={line.text} progress={line.fillProgress}
                    activeColor={anim.activeColor} baseColor={anim.inactiveColor} style={baseStyle} />
                ) : (
                  <div style={{ ...baseStyle, color: lineColor }}>{line.text}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
