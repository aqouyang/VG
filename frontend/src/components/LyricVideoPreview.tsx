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
  const layout = computeLayout(cfg, WIDTH, HEIGHT);
  const s = Math.min(WIDTH / 1920, HEIGHT / 1080);

  // Find active line
  let activeLine = -1;
  for (let i = lrcLines.length - 1; i >= 0; i--) {
    if (currentTime >= lrcLines[i].time) {
      activeLine = i;
      break;
    }
  }

  const shadowAlpha = cfg.cover.shadowIntensity;

  return (
    <div
      style={{
        width: WIDTH,
        height: HEIGHT,
        position: "relative",
        overflow: "hidden",
        borderRadius: 8,
        background: cfg.background.type === "solid" ? cfg.background.solidColor : "#0a0a0f",
      }}
    >
      {/* Background */}
      {cfg.background.type === "blurred-cover" && coverUrl && (
        <img
          src={coverUrl}
          alt=""
          style={{
            position: "absolute",
            inset: -30,
            width: "calc(100% + 60px)",
            height: "calc(100% + 60px)",
            objectFit: "cover",
            filter: layout.bg.filter,
          }}
        />
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
          <div
            style={{
              position: "absolute",
              left: layout.cover.x,
              top: layout.cover.y,
              width: layout.cover.size,
              height: layout.cover.size,
              borderRadius: layout.cover.radius,
              overflow: "hidden",
              boxShadow: `0 ${8 * s}px ${32 * s}px rgba(0,0,0,${shadowAlpha})`,
            }}
          >
            <img
              src={coverUrl}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>
        )}

        {/* Title & artist */}
        <div
          style={{
            position: "absolute",
            left: layout.title.textAlign === "right"
              ? undefined
              : layout.title.textAlign === "center"
                ? 0
                : layout.title.x,
            right: layout.title.textAlign === "right" ? WIDTH - layout.title.x : undefined,
            top: layout.title.y,
            width: layout.title.textAlign === "center" ? WIDTH : layout.cover.size,
            textAlign: layout.title.textAlign as React.CSSProperties["textAlign"],
            opacity: cfg.title.opacity,
          }}
        >
          <div
            style={{
              color: cfg.title.color,
              fontSize: cfg.title.fontSize * s,
              fontWeight: cfg.title.fontWeight,
              fontFamily: cfg.title.fontFamily,
              lineHeight: 1.3,
            }}
          >
            {project.title}
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
            {project.artist}
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
          }}
        >
          {lrcLines.map((line, i) => {
            const diff = i - activeLine;
            if (Math.abs(diff) > cfg.lyrics.visibleLines) return null;
            const isActive = i === activeLine;
            const isPast = diff < 0;
            const yOffset = diff * cfg.lyrics.lineSpacing * s;
            const fontSize = (isActive ? cfg.lyrics.activeFontSize : cfg.lyrics.inactiveFontSize) * s;
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  top: "50%",
                  left: 0,
                  right: 0,
                  transform: `translateY(${yOffset - fontSize / 2}px)`,
                  color: isActive ? cfg.lyrics.activeColor : "#fff",
                  fontSize,
                  fontWeight: isActive ? cfg.lyrics.activeWeight : 400,
                  opacity: isActive ? 1 : isPast ? cfg.lyrics.inactiveOpacity : cfg.lyrics.futureOpacity,
                  fontFamily: cfg.lyrics.fontFamily,
                  lineHeight: 1.5,
                  textAlign: cfg.lyrics.textAlign as React.CSSProperties["textAlign"],
                  transition: `all ${cfg.lyrics.scrollSpeed}s ease`,
                }}
              >
                {line.text}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
