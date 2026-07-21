import React from "react";
import type { Project, LrcLine, VisualConfig, LyricAnimationConfig } from "../types";
import { computeLayout } from "../utils/layout";
import { defaultVisualConfig } from "../utils/visualDefaults";
import { computeLyricState } from "../utils/lyricState";

interface Props {
  project: Project;
  lrcLines: LrcLine[];
  currentTime: number;
  coverUrl: string | null;
  visualConfig?: VisualConfig;
}

const WIDTH = 640;
const HEIGHT = 360;

function ColoredLine({ text, progress, activeColor, baseColor, style }: {
  text: string; progress: number; activeColor: string; baseColor: string;
  style: React.CSSProperties;
}) {
  if (progress <= 0) return <div style={{ ...style, color: baseColor }}>{text}</div>;
  if (progress >= 1) return <div style={{ ...style, color: activeColor }}>{text}</div>;
  const chars = [...text];
  const n = Math.floor(progress * chars.length);
  return (
    <div style={style}>
      {chars.map((ch, i) => <span key={i} style={{ color: i < n ? activeColor : baseColor }}>{ch}</span>)}
    </div>
  );
}

export default function LyricVideoPreview({ project, lrcLines, currentTime, coverUrl, visualConfig }: Props) {
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

  const lyricState = computeLyricState(currentTime, lrcLines, cfg, s, project.duration ?? undefined);
  const shadowAlpha = cfg.cover.shadowIntensity;
  const spacing = cfg.lyrics.lineSpacing * s;
  const containerH = layout.lyrics.h;

  // Scroll: position active line at vertical center of container.
  // Total content height = all lines * spacing.
  // scrollOffset = how far to translate the inner div upward.
  const totalContentH = lrcLines.length * spacing;
  const activeIdx = lyricState.activeLine;
  let targetY = activeIdx >= 0 ? activeIdx * spacing + spacing / 2 : 0;
  // Clamp: don't scroll past the content
  const maxScroll = Math.max(0, totalContentH - containerH / 2);
  targetY = Math.max(0, Math.min(targetY, maxScroll));
  const translateY = containerH / 2 - targetY;

  return (
    <div style={{
      width: previewW, height: previewH, position: "relative", overflow: "hidden", borderRadius: 8,
      background: cfg.background.type === "solid" ? cfg.background.solidColor : "#0a0a0f",
    }}>
      {cfg.background.type === "blurred-cover" && coverUrl && (
        <img src={coverUrl} alt="" style={{
          position: "absolute", inset: -30, width: "calc(100% + 60px)", height: "calc(100% + 60px)",
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

        <div style={{
          position: "absolute",
          left: layout.title.textAlign === "right" ? undefined : layout.title.textAlign === "center" ? 0 : layout.title.x,
          right: layout.title.textAlign === "right" ? previewW - layout.title.x : undefined,
          top: layout.title.y,
          width: layout.title.textAlign === "center" ? previewW : layout.cover.size,
          textAlign: layout.title.textAlign as any, opacity: cfg.title.opacity,
        }}>
          <div style={{ color: cfg.title.color, fontSize: cfg.title.fontSize * s, fontWeight: cfg.title.fontWeight, fontFamily: cfg.title.fontFamily, lineHeight: 1.3 }}>{project.title}</div>
          <div style={{ color: cfg.artist.color, fontSize: cfg.artist.fontSize * s, fontWeight: cfg.artist.fontWeight, fontFamily: cfg.artist.fontFamily, marginTop: cfg.artist.offsetY * s, opacity: cfg.artist.opacity }}>{project.artist}</div>
        </div>

        {/* Lyrics */}
        <div style={{
          position: "absolute", left: layout.lyrics.x, top: layout.lyrics.y,
          width: layout.lyrics.w, height: containerH, overflow: "hidden",
        }}>
          <div style={{
            transform: `translateY(${translateY}px)`,
            transition: `transform ${cfg.lyrics.scrollSpeed}s ease`,
          }}>
            {lyricState.lines.map(line => {
              if (line.opacity <= 0) return (
                <div key={line.index} style={{ height: spacing }} />
              );
              const lineColor = _getColor(line, anim, cfg);
              return (
                <div key={line.index} style={{
                  minHeight: spacing, display: "flex", alignItems: "center",
                  opacity: line.opacity,
                  transition: `opacity ${cfg.lyrics.scrollSpeed}s ease`,
                }}>
                  {anim.enabled && line.isActive && line.fillProgress > 0 ? (
                    <ColoredLine text={line.text} progress={line.fillProgress}
                      activeColor={anim.activeColor} baseColor={anim.inactiveColor}
                      style={{
                        fontSize: line.fontSize, fontWeight: line.fontWeight,
                        fontFamily: cfg.lyrics.fontFamily, lineHeight: 1.5,
                        letterSpacing: (cfg.lyrics.letterSpacing ?? 0) * s,
                        textAlign: cfg.lyrics.textAlign as any, width: "100%",
                      }} />
                  ) : (
                    <div style={{
                      color: lineColor, fontSize: line.fontSize, fontWeight: line.fontWeight,
                      fontFamily: cfg.lyrics.fontFamily, lineHeight: 1.5,
                      letterSpacing: (cfg.lyrics.letterSpacing ?? 0) * s,
                      textAlign: cfg.lyrics.textAlign as any, width: "100%",
                    }}>{line.text}</div>
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

function _getColor(line: { isActive: boolean; isPast: boolean }, anim: LyricAnimationConfig, cfg: VisualConfig): string {
  if (!anim.enabled) return line.isActive ? cfg.lyrics.activeColor : "#fff";
  if (line.isPast) return anim.completedColor;
  return anim.inactiveColor ?? "#fff";
}
