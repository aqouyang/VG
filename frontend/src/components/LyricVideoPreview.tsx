import React from "react";
import type { Project, LrcLine, VisualConfig, LyricAnimationConfig } from "../types";
import { computeLayout } from "../utils/layout";
import { defaultVisualConfig } from "../utils/visualDefaults";

interface Props {
  project: Project;
  lrcLines: LrcLine[];
  currentTime: number;
  coverUrl: string | null;
  visualConfig?: VisualConfig;
}

const WIDTH = 640;
const HEIGHT = 360;

// ─── Per-character colored lyric line ────────────────────────────────
function ColoredLine({
  text, progress, activeColor, baseColor,
  fontSize, fontWeight, fontFamily, letterSpacing, opacity, textAlign,
}: {
  text: string; progress: number;
  activeColor: string; baseColor: string;
  fontSize: number; fontWeight: number; fontFamily: string;
  letterSpacing: number; opacity: number; textAlign: string;
}) {
  if (progress <= 0 || progress >= 1) {
    // No partial coloring needed
    return (
      <div style={{
        color: progress >= 1 ? activeColor : baseColor,
        fontSize, fontWeight, fontFamily, letterSpacing,
        opacity, lineHeight: 1.5, textAlign: textAlign as any,
        whiteSpace: "pre-wrap",
      }}>
        {text}
      </div>
    );
  }

  // Split into characters and color based on progress
  const chars = [...text]; // handles multi-byte (Chinese, emoji)
  const coloredCount = Math.floor(progress * chars.length);

  return (
    <div style={{
      fontSize, fontWeight, fontFamily, letterSpacing,
      opacity, lineHeight: 1.5, textAlign: textAlign as any,
      whiteSpace: "pre-wrap",
    }}>
      {chars.map((ch, ci) => (
        <span key={ci} style={{ color: ci < coloredCount ? activeColor : baseColor }}>
          {ch}
        </span>
      ))}
    </div>
  );
}

export default function LyricVideoPreview({
  project, lrcLines, currentTime, coverUrl, visualConfig,
}: Props) {
  const cfg = visualConfig ?? defaultVisualConfig;
  const videoW = cfg.video?.width ?? 1920;
  const videoH = cfg.video?.height ?? 1080;
  const aspect = videoW / videoH;
  const previewW = aspect >= 1 ? WIDTH : Math.round(HEIGHT * aspect);
  const previewH = aspect >= 1 ? Math.round(WIDTH / aspect) : HEIGHT;
  const layout = computeLayout(cfg, previewW, previewH);
  const s = Math.min(previewW / 1920, previewH / 1080);
  const anim: LyricAnimationConfig = cfg.lyricAnimation ?? {
    enabled: false, activeColor: "#6c5ce7", completedColor: "#888",
    inactiveColor: "#fff", colorMode: "current-line", transitionDuration: 2,
  };

  // Find active line
  let activeLine = -1;
  for (let i = lrcLines.length - 1; i >= 0; i--) {
    if (currentTime >= lrcLines[i].time) { activeLine = i; break; }
  }

  // Compute fill progress for a line
  function getProgress(i: number): number {
    if (!anim.enabled || i !== activeLine) return 0;
    const line = lrcLines[i];
    const next = lrcLines[i + 1];
    const dur = next ? next.time - line.time : anim.transitionDuration;
    const elapsed = currentTime - line.time;
    return Math.max(0, Math.min(1, elapsed / Math.min(dur, anim.transitionDuration)));
  }

  // Determine line color
  function getLineColor(i: number): { color: string; progress: number } {
    if (!anim.enabled) {
      const isActive = i === activeLine;
      return { color: isActive ? cfg.lyrics.activeColor : "#fff", progress: 0 };
    }
    const isPast = i < activeLine;
    const isActive = i === activeLine;
    if (isActive) {
      return { color: anim.inactiveColor, progress: getProgress(i) };
    }
    if (isPast && anim.colorMode === "all-played") {
      return { color: anim.completedColor, progress: 0 };
    }
    if (isPast) {
      return { color: anim.completedColor, progress: 0 };
    }
    return { color: anim.inactiveColor, progress: 0 };
  }

  const shadowAlpha = cfg.cover.shadowIntensity;

  return (
    <div style={{
      width: previewW, height: previewH, position: "relative",
      overflow: "hidden", borderRadius: 8,
      background: cfg.background.type === "solid" ? cfg.background.solidColor : "#0a0a0f",
    }}>
      {/* Background */}
      {cfg.background.type === "blurred-cover" && coverUrl && (
        <img src={coverUrl} alt="" style={{
          position: "absolute", inset: -30,
          width: "calc(100% + 60px)", height: "calc(100% + 60px)",
          objectFit: "cover", filter: layout.bg.filter,
        }} />
      )}
      {cfg.background.type === "gradient" && (
        <div style={{ position: "absolute", inset: 0, ...layout.bg.bgStyle }} />
      )}
      {cfg.background.overlayOpacity > 0 && (
        <div style={layout.bg.overlayStyle as React.CSSProperties} />
      )}

      <div style={{ position: "relative", width: "100%", height: "100%", zIndex: 1 }}>
        {/* Cover */}
        {coverUrl && (
          <div style={{
            position: "absolute", left: layout.cover.x, top: layout.cover.y,
            width: layout.cover.size, height: layout.cover.size,
            borderRadius: layout.cover.radius, overflow: "hidden",
            boxShadow: `0 ${8 * s}px ${32 * s}px rgba(0,0,0,${shadowAlpha})`,
          }}>
            <img src={coverUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
        )}

        {/* Title */}
        <div style={{
          position: "absolute",
          left: layout.title.textAlign === "right" ? undefined
            : layout.title.textAlign === "center" ? 0 : layout.title.x,
          right: layout.title.textAlign === "right" ? previewW - layout.title.x : undefined,
          top: layout.title.y,
          width: layout.title.textAlign === "center" ? previewW : layout.cover.size,
          textAlign: layout.title.textAlign as any,
          opacity: cfg.title.opacity,
        }}>
          <div style={{
            color: cfg.title.color, fontSize: cfg.title.fontSize * s,
            fontWeight: cfg.title.fontWeight, fontFamily: cfg.title.fontFamily, lineHeight: 1.3,
          }}>{project.title}</div>
          <div style={{
            color: cfg.artist.color, fontSize: cfg.artist.fontSize * s,
            fontWeight: cfg.artist.fontWeight, fontFamily: cfg.artist.fontFamily,
            marginTop: cfg.artist.offsetY * s, opacity: cfg.artist.opacity,
          }}>{project.artist}</div>
        </div>

        {/* Lyrics: use flow layout so wrapped lines push others down */}
        <div style={{
          position: "absolute", left: layout.lyrics.x, top: layout.lyrics.y,
          width: layout.lyrics.w, height: layout.lyrics.h,
          overflow: "hidden",
        }}>
          {/* Inner wrapper: translated to keep active line centered */}
          <div style={{
            transition: `transform ${cfg.lyrics.scrollSpeed}s ease`,
            transform: `translateY(${layout.lyrics.h / 2 - (function() {
              // Calculate offset to center the active line.
              // Sum heights of lines before active, using lineSpacing as minimum per line.
              const spacing = cfg.lyrics.lineSpacing * s;
              let offset = 0;
              for (let i = 0; i < Math.max(0, activeLine); i++) {
                offset += spacing;
              }
              return offset + spacing / 2;
            })()}px)`,
          }}>
            {lrcLines.map((line, i) => {
              const diff = i - activeLine;
              if (Math.abs(diff) > cfg.lyrics.visibleLines + 1) return null;
              const isActive = i === activeLine;
              const isPast = diff < 0;
              const fontSize = (isActive ? cfg.lyrics.activeFontSize : cfg.lyrics.inactiveFontSize) * s;
              const baseOpacity = isActive ? 1 : isPast ? cfg.lyrics.inactiveOpacity : cfg.lyrics.futureOpacity;
              const lineColor = getLineColor(i);
              const spacing = cfg.lyrics.lineSpacing * s;

              return (
                <div key={i} style={{
                  minHeight: spacing,
                  display: "flex", alignItems: "center",
                  transition: `opacity ${cfg.lyrics.scrollSpeed}s ease`,
                }}>
                  {anim.enabled && isActive && lineColor.progress > 0 ? (
                    <ColoredLine
                      text={line.text}
                      progress={lineColor.progress}
                      activeColor={anim.activeColor}
                      baseColor={anim.inactiveColor}
                      fontSize={fontSize}
                      fontWeight={isActive ? cfg.lyrics.activeWeight : 400}
                      fontFamily={cfg.lyrics.fontFamily}
                      letterSpacing={(cfg.lyrics.letterSpacing ?? 0) * s}
                      opacity={baseOpacity}
                      textAlign={cfg.lyrics.textAlign}
                    />
                  ) : (
                    <div style={{
                      color: lineColor.color, fontSize,
                      fontWeight: isActive ? cfg.lyrics.activeWeight : 400,
                      fontFamily: cfg.lyrics.fontFamily, lineHeight: 1.5,
                      letterSpacing: (cfg.lyrics.letterSpacing ?? 0) * s,
                      opacity: baseOpacity,
                      textAlign: cfg.lyrics.textAlign as any,
                      width: "100%",
                    }}>
                      {line.text}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
