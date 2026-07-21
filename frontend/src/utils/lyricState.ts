/**
 * Shared lyric render state calculator.
 * Pure function: timestamp + lyrics + config -> render state.
 * No React, no DOM, no accumulated state.
 * The result for time t does not depend on any previous timestamp.
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
  relativeIndex: number;
  opacity: number;
  fontSize: number;
  fontWeight: number;
  fillProgress: number;
}

export interface LyricRenderState {
  activeLine: number;
  lines: LyricRenderLine[];
}

/**
 * Compute the lyric render state at a given timestamp.
 *
 * Active line rule: greatest index whose startTime <= currentTime.
 * Before first lyric: activeLine = -1, all lines are "future".
 * After last lyric starts: activeLine = last index, stays active.
 *
 * ALL lines are always included in the result. The container uses
 * overflow:hidden to clip. This prevents scroll offset miscalculation
 * when only a subset of lines is rendered.
 */
export function computeLyricState(
  currentTime: number,
  lrcLines: LrcLine[],
  cfg: VisualConfig,
  scale: number,
  audioDuration?: number,
): LyricRenderState {
  const lyrics = cfg.lyrics;
  const anim = cfg.lyricAnimation;
  const visibleLines = lyrics.visibleLines;

  // Find active line: greatest index whose time <= currentTime
  let activeLine = -1;
  for (let i = lrcLines.length - 1; i >= 0; i--) {
    if (currentTime >= lrcLines[i].time) {
      activeLine = i;
      break;
    }
  }

  const result: LyricRenderLine[] = [];

  for (let i = 0; i < lrcLines.length; i++) {
    const line = lrcLines[i];
    const nextLine = lrcLines[i + 1];

    // End time: next line start, or audio duration, or line + hold time
    let endTime: number;
    if (nextLine) {
      endTime = nextLine.time;
    } else if (audioDuration && audioDuration > line.time) {
      endTime = audioDuration;
    } else {
      endTime = line.time + (anim?.transitionDuration ?? 5);
    }

    const relIdx = activeLine >= 0 ? i - activeLine : i;
    const isActive = i === activeLine;
    const isPast = activeLine >= 0 && i < activeLine;
    const isFuture = !isActive && !isPast;

    // Opacity: based on distance from active, not absolute index.
    // Lines far from active get 0 opacity (hidden by CSS overflow).
    const dist = Math.abs(relIdx);
    let opacity: number;
    if (isActive) {
      opacity = 1;
    } else if (dist > visibleLines) {
      opacity = 0;
    } else if (isPast) {
      opacity = lyrics.inactiveOpacity;
    } else {
      opacity = lyrics.futureOpacity;
    }

    const fontSize = (isActive ? lyrics.activeFontSize : lyrics.inactiveFontSize) * scale;
    const fontWeight = isActive ? lyrics.activeWeight : 400;

    let fillProgress = 0;
    if (anim?.enabled && isActive && currentTime >= line.time) {
      const dur = Math.min(endTime - line.time, anim.transitionDuration);
      if (dur > 0) {
        fillProgress = Math.max(0, Math.min(1, (currentTime - line.time) / dur));
      }
    }

    result.push({
      index: i, text: line.text, time: line.time, endTime,
      isActive, isPast, isFuture, relativeIndex: relIdx,
      opacity, fontSize, fontWeight, fillProgress,
    });
  }

  return { activeLine, lines: result };
}
