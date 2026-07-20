export interface Project {
  name: string;
  title: string;
  artist: string;
  audio_file: string | null;
  lyrics_file: string | null;
  lrc_file: string | null;
  cover_file: string | null;
  duration: number | null;
  visual_config?: VisualConfig;
}

export interface LrcLine {
  time: number;
  text: string;
}

export interface WaveformData {
  fps: number;
  duration: number;
  total_frames: number;
  amplitudes: number[];
  bars: number[][];
  n_bands: number;
}

export interface AlignmentResult {
  method: string;
  lrc_file: string;
  lrc_content: string;
  timestamps: { line: string; start: number }[];
}

// --- Visual Configuration ---

export interface VisualConfig {
  cover: CoverConfig;
  lyrics: LyricsConfig;
  title: TitleConfig;
  artist: ArtistConfig;
  background: BackgroundConfig;
}

export interface CoverConfig {
  position: "left" | "center" | "right";
  offsetX: number; // px offset from position anchor (at 1920 scale)
  offsetY: number;
  widthPercent: number; // percent of frame width, 5-80
  borderRadius: number; // px at 1920 scale
  shadowIntensity: number; // 0-1
}

export interface LyricsConfig {
  position: "left" | "center" | "right";
  offsetX: number;
  offsetY: number;
  widthPercent: number; // percent of frame width
  verticalAlign: "top" | "center" | "bottom";
  textAlign: "left" | "center" | "right";
  fontFamily: string;
  activeFontSize: number; // px at 1920 scale
  inactiveFontSize: number;
  lineSpacing: number; // px between lines at 1920 scale
  activeColor: string;
  activeWeight: number;
  inactiveOpacity: number; // 0-1 for past lines
  futureOpacity: number; // 0-1 for upcoming lines
  scrollSpeed: number; // transition duration in seconds
  visibleLines: number; // how many lines above/below active to show
}

export interface TitleConfig {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  opacity: number;
  position: "below-cover" | "top-left" | "top-right" | "top-center" | "bottom-center";
  offsetX: number;
  offsetY: number;
}

export interface ArtistConfig {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  opacity: number;
  offsetY: number; // gap below title
}

export type BackgroundType = "blurred-cover" | "solid" | "gradient";

export interface BackgroundConfig {
  type: BackgroundType;
  blurAmount: number; // px
  brightness: number; // 0-1
  overlayOpacity: number; // 0-1, dark overlay
  solidColor: string;
  gradientFrom: string;
  gradientTo: string;
  gradientAngle: number; // degrees
}

// --- Themes ---

export interface Theme {
  name: string;
  label: string;
  config: VisualConfig;
}
