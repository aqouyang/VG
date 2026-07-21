/**
 * Shared lyric render state calculator.
 * Used by Preview, Remotion renderer, and (conceptually) Fast Renderer.
 *
 * Pure function: timestamp + lyrics + config -> render state.
 * No React, no DOM, no accumulated state.
 */

import type { LrcLine, VisualConfig } from "../types";

export interface LyricRenderLine {
  index: number;
  text: string;
  time: number;
  endTime: number;
  isActive: boolean;
  isPast: boolean;
  isFuture: boolean;
  /** Distance from active line (negative = above, positive = below) */
  relativeIndex: number;
  /** 0 = fully transparent, 1 = fully opaque */
  opacity: number;
  /** Font size in pixels at canvas scale */
  fontSize: number;
  /** Font weight */
  fontWeight: number;
  /** For karaoke: 0-1 progress through the line */
  fillProgress: number;
}

export interface LyricRenderState {
  activeLine: number;
  lines: LyricRenderLine[];
}

export function computeLyricState(
  currentTime: number,
  lrcLines: LrcLine[],
  cfg: VisualConfig,
  scale: number,
): LyricRenderState {
  const lyrics = cfg.lyrics;
  const anim = cfg.lyricAnimation;
  const visibleLines = lyrics.visibleLines;

  // Find active line
  let activeLine = -1;
  for (let i = lrcLines.length - 1; i >= 0; i--) {
    if (currentTime >= lrcLines[i].time) {
      activeLine = i;
      break;
    }
  }

  // Pre-roll: if before first line, show upcoming lines
  if (activeLine < 0 && lrcLines.length > 0 && currentTime >= 0) {
    activeLine = -1; // No active, but show future lines relative to index 0
  }

  const result: LyricRenderLine[] = [];

  for (let i = 0; i < lrcLines.length; i++) {
    const relIdx = activeLine >= 0 ? i - activeLine : i;
    if (Math.abs(relIdx) > visibleLines + 1) continue;

    const line = lrcLines[i];
    const nextLine = lrcLines[i + 1];
    const endTime = nextLine ? nextLine.time : line.time + (anim?.transitionDuration ?? 5);
    const isActive = i === activeLine;
    const isPast = activeLine >= 0 && i < activeLine;
    const isFuture = activeLine < 0 || i > activeLine;

    // Opacity: based on relative distance, not absolute index
    let opacity: number;
    if (isActive) {
      opacity = 1;
    } else if (isPast) {
      opacity = lyrics.inactiveOpacity;
    } else {
      opacity = lyrics.futureOpacity;
    }

    const fontSize = (isActive ? lyrics.activeFontSize : lyrics.inactiveFontSize) * scale;
    const fontWeight = isActive ? lyrics.activeWeight : 400;

    // Karaoke fill progress
    let fillProgress = 0;
    if (anim?.enabled && isActive && currentTime >= line.time) {
      const dur = Math.min(endTime - line.time, anim.transitionDuration);
      fillProgress = Math.max(0, Math.min(1, (currentTime - line.time) / dur));
    }

    result.push({
      index: i,
      text: line.text,
      time: line.time,
      endTime,
      isActive,
      isPast,
      isFuture,
      relativeIndex: relIdx,
      opacity,
      fontSize,
      fontWeight,
      fillProgress,
    });
  }

  return { activeLine, lines: result };
}
