import type { LrcLine } from "../types";

const LRC_RE = /^\[(\d{1,2}):(\d{2}(?:\.\d+)?)\](.+)$/;

export function isLrcFormat(content: string): boolean {
  return content.split("\n").some((l) => LRC_RE.test(l.trim()));
}

export function parseLrc(content: string): LrcLine[] {
  const lines = content.split("\n").filter((l) => l.trim());
  const result: LrcLine[] = [];

  for (const line of lines) {
    const match = line.trim().match(LRC_RE);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseFloat(match[2]);
      const time = minutes * 60 + seconds;
      result.push({ time, text: match[3] });
    }
  }

  return result.sort((a, b) => a.time - b.time);
}

/** Parse plain text lyrics (one line per lyric). All timestamps start at -1 (unset). */
export function parsePlainLyrics(content: string): LrcLine[] {
  return content
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((text) => ({ time: -1, text }));
}

/** Auto-detect format and parse accordingly. */
export function parseAnyLyrics(content: string): LrcLine[] {
  if (isLrcFormat(content)) {
    return parseLrc(content);
  }
  return parsePlainLyrics(content);
}

export function formatTime(seconds: number): string {
  if (seconds < 0) return "--:--.--";
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return `${min.toString().padStart(2, "0")}:${sec.toFixed(2).padStart(5, "0")}`;
}

export function lrcLinesToString(lines: LrcLine[]): string {
  return lines
    .filter((l) => l.time >= 0)
    .map((l) => `[${formatTime(l.time)}]${l.text}`)
    .join("\n");
}
