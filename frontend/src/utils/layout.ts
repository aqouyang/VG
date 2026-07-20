import type { VisualConfig } from "../types";

/**
 * Compute absolute pixel positions for all elements at a given frame size.
 * All config values are authored at 1920x1080; scale is applied here.
 */
export interface LayoutResult {
  cover: { x: number; y: number; size: number; radius: number };
  lyrics: { x: number; y: number; w: number; h: number };
  title: { x: number; y: number; textAlign: CanvasTextAlign };
  bg: {
    filter: string;
    bgStyle: React.CSSProperties;
    overlayStyle: React.CSSProperties;
  };
}

export function computeLayout(
  cfg: VisualConfig,
  w: number,
  h: number
): LayoutResult {
  const sx = w / 1920;
  const sy = h / 1080;
  const s = Math.min(sx, sy); // uniform scale for font/radius

  // --- Cover ---
  const coverSize = (cfg.cover.widthPercent / 100) * w;
  let coverX: number;
  if (cfg.cover.position === "left") {
    coverX = w * 0.15 - coverSize / 2;
  } else if (cfg.cover.position === "right") {
    coverX = w * 0.85 - coverSize / 2;
  } else {
    coverX = (w - coverSize) / 2;
  }
  coverX += cfg.cover.offsetX * sx;
  const coverY = (h - coverSize) / 2 + cfg.cover.offsetY * sy;

  // --- Lyrics ---
  const lyricsW = (cfg.lyrics.widthPercent / 100) * w;
  let lyricsX: number;
  if (cfg.lyrics.position === "left") {
    lyricsX = w * 0.05;
  } else if (cfg.lyrics.position === "right") {
    lyricsX = w - w * 0.05 - lyricsW;
  } else {
    lyricsX = (w - lyricsW) / 2;
  }
  lyricsX += cfg.lyrics.offsetX * sx;

  let lyricsY: number;
  const lyricsH = coverSize; // match cover height as default bounding box
  if (cfg.lyrics.verticalAlign === "top") {
    lyricsY = h * 0.1;
  } else if (cfg.lyrics.verticalAlign === "bottom") {
    lyricsY = h - h * 0.1 - lyricsH;
  } else {
    lyricsY = (h - lyricsH) / 2;
  }
  lyricsY += cfg.lyrics.offsetY * sy;

  // --- Title ---
  let titleX: number;
  let titleY: number;
  let titleTextAlign: CanvasTextAlign = "left";
  const pos = cfg.title.position;
  if (pos === "below-cover") {
    titleX = coverX;
    titleY = coverY + coverSize + cfg.title.offsetY * sy;
  } else if (pos === "top-left") {
    titleX = cfg.title.offsetX * sx + 80 * sx;
    titleY = cfg.title.offsetY * sy + 50 * sy;
  } else if (pos === "top-right") {
    titleX = w - cfg.title.offsetX * sx - 80 * sx;
    titleY = cfg.title.offsetY * sy + 50 * sy;
    titleTextAlign = "right";
  } else if (pos === "top-center") {
    titleX = w / 2;
    titleY = cfg.title.offsetY * sy + 50 * sy;
    titleTextAlign = "center";
  } else {
    // bottom-center
    titleX = w / 2;
    titleY = h - 80 * sy + cfg.title.offsetY * sy;
    titleTextAlign = "center";
  }

  // --- Background ---
  const bgCfg = cfg.background;
  let bgFilter = "";
  const bgStyle: React.CSSProperties = {};
  const overlayStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
  };

  if (bgCfg.type === "blurred-cover") {
    bgFilter = `blur(${bgCfg.blurAmount * s}px) brightness(${bgCfg.brightness}) saturate(1.4)`;
  } else if (bgCfg.type === "solid") {
    bgStyle.backgroundColor = bgCfg.solidColor;
  } else {
    bgStyle.background = `linear-gradient(${bgCfg.gradientAngle}deg, ${bgCfg.gradientFrom}, ${bgCfg.gradientTo})`;
  }

  if (bgCfg.overlayOpacity > 0) {
    overlayStyle.background = `radial-gradient(ellipse at 40% 45%, rgba(0,0,0,${bgCfg.overlayOpacity * 0.3}) 0%, rgba(0,0,0,${bgCfg.overlayOpacity}) 100%)`;
  }

  return {
    cover: {
      x: coverX,
      y: coverY,
      size: coverSize,
      radius: cfg.cover.borderRadius * s,
    },
    lyrics: { x: lyricsX, y: lyricsY, w: lyricsW, h: lyricsH },
    title: { x: titleX, y: titleY, textAlign: titleTextAlign },
    bg: { filter: bgFilter, bgStyle, overlayStyle },
  };
}
