import type { LrcLine } from "../types";

export function parseLrc(content: string): LrcLine[] {
  const lines = content.split("\n").filter((l) => l.trim());
  const result: LrcLine[] = [];

  for (const line of lines) {
    const match = line.match(/^\[(\d{2}):(\d{2}(?:\.\d+)?)\](.*)$/);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseFloat(match[2]);
      const time = minutes * 60 + seconds;
      result.push({ time, text: match[3] });
    }
  }

  return result.sort((a, b) => a.time - b.time);
}

export function formatTime(seconds: number): string {
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return `${min.toString().padStart(2, "0")}:${sec.toFixed(2).padStart(5, "0")}`;
}

export function lrcLinesToString(lines: LrcLine[]): string {
  return lines.map((l) => `[${formatTime(l.time)}]${l.text}`).join("\n");
}
