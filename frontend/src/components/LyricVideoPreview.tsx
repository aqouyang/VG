import React from "react";
import type { Project, LrcLine, VisualConfig } from "../types";
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

export default function LyricVideoPreview({
  project,
  lrcLines,
  currentTime,
  coverUrl,
  visualConfig,
}: Props) {
  const cfg = visualConfig ?? defaultVisualConfig;

  // Use video config aspect ratio if available
  const videoW = cfg.video?.width ?? 1920;
  const videoH = cfg.video?.height ?? 1080;
  const aspect = videoW / videoH;
  const previewW = aspect >= 1 ? WIDTH : Math.round(HEIGHT * aspect);
  const previewH = aspect >= 1 ? Math.round(WIDTH / aspect) : HEIGHT;

  const layout = computeLayout(cfg, previewW, previewH);
  const s = Math.min(previewW / 1920, previewH / 1080);
  const anim = cfg.lyricAnimation;

  // Find active line
  let activeLine = -1;
  for (let i = lrcLines.length - 1; i >= 0; i--) {
    if (currentTime >= lrcLines[i].time) {
      activeLine = i;
      break;
    }
  }

  const shadowAlpha = cfg.cover.shadowIntensity;

  function getLineFillProgress(lineIdx: number): number {
    if (!anim?.enabled) return 0;
    const line = lrcLines[lineIdx];
    const nextLine = lrcLines[lineIdx + 1];
    const lineDuration = nextLine ? nextLine.time - line.time : anim.transitionDuration;
    const elapsed = currentTime - line.time;
    return Math.max(0, Math.min(1, elapsed / Math.min(lineDuration, anim.transitionDuration)));
  }

  function getLineColor(lineIdx: number, isActive: boolean, isPast: boolean): React.CSSProperties {
    if (!anim?.enabled) {
      return { color: isActive ? cfg.lyrics.activeColor : "#fff" };
    }
    if (isPast) {
      return { color: anim.completedColor };
    }
    if (isActive) {
      const progress = getLineFillProgress(lineIdx);
      return {
        background: `linear-gradient(to right, ${anim.activeColor} ${progress * 100}%, ${cfg.lyrics.activeColor} ${progress * 100}%)`,
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text",
      };
    }
    return { color: "#fff" };
  }

  return (
    <div style={{
      width: previewW, height: previewH, position: "relative", overflow: "hidden",
      borderRadius: 8,
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

      {/* Content */}
      <div style={{ position: "relative", width: "100%", height: "100%", zIndex: 1 }}>
        {/* Album cover */}
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

        {/* Title & artist */}
        <div style={{
          position: "absolute",
          left: layout.title.textAlign === "right" ? undefined
            : layout.title.textAlign === "center" ? 0 : layout.title.x,
          right: layout.title.textAlign === "right" ? previewW - layout.title.x : undefined,
          top: layout.title.y,
          width: layout.title.textAlign === "center" ? previewW : layout.cover.size,
          textAlign: layout.title.textAlign as React.CSSProperties["textAlign"],
          opacity: cfg.title.opacity,
        }}>
          <div style={{
            color: cfg.title.color, fontSize: cfg.title.fontSize * s,
            fontWeight: cfg.title.fontWeight, fontFamily: cfg.title.fontFamily, lineHeight: 1.3,
          }}>
            {project.title}
          </div>
          <div style={{
            color: cfg.artist.color, fontSize: cfg.artist.fontSize * s,
            fontWeight: cfg.artist.fontWeight, fontFamily: cfg.artist.fontFamily,
            marginTop: cfg.artist.offsetY * s, opacity: cfg.artist.opacity,
          }}>
            {project.artist}
          </div>
        </div>

        {/* Scrolling lyrics */}
        <div style={{
          position: "absolute", left: layout.lyrics.x, top: layout.lyrics.y,
          width: layout.lyrics.w, height: layout.lyrics.h,
          display: "flex", flexDirection: "column", justifyContent: "center", overflow: "hidden",
        }}>
          {lrcLines.map((line, i) => {
            const diff = i - activeLine;
            if (Math.abs(diff) > cfg.lyrics.visibleLines) return null;
            const isActive = i === activeLine;
            const isPast = diff < 0;
            const yOffset = diff * cfg.lyrics.lineSpacing * s;
            const fontSize = (isActive ? cfg.lyrics.activeFontSize : cfg.lyrics.inactiveFontSize) * s;
            const colorStyle = getLineColor(i, isActive, isPast);
            return (
              <div key={i} style={{
                position: "absolute", top: "50%", left: 0, right: 0,
                transform: `translateY(${yOffset - fontSize / 2}px)`,
                fontSize, fontWeight: isActive ? cfg.lyrics.activeWeight : 400,
                opacity: isActive ? 1 : isPast ? cfg.lyrics.inactiveOpacity : cfg.lyrics.futureOpacity,
                fontFamily: cfg.lyrics.fontFamily, lineHeight: 1.5,
                letterSpacing: (cfg.lyrics.letterSpacing ?? 0) * s,
                textAlign: cfg.lyrics.textAlign as React.CSSProperties["textAlign"],
                transition: `all ${cfg.lyrics.scrollSpeed}s ease`,
                ...colorStyle,
              }}>
                {line.text}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
