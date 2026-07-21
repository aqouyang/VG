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
  // Multi-layout support
  layouts?: ProjectLayouts;
}

export interface ProjectLayouts {
  order: string[];
  activeId: string;
  items: Record<string, SavedLayout>;
}

export interface SavedLayout {
  id: string;
  name: string;
  aspectRatio: string; // "16:9", "9:16", "1:1", "4:3", etc.
  config: VisualConfig;
  createdAt: string;
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
  video: VideoConfig;
  lyricAnimation: LyricAnimationConfig;
}

export interface CoverConfig {
  position: "left" | "center" | "right";
  offsetX: number;
  offsetY: number;
  widthPercent: number;
  borderRadius: number;
  shadowIntensity: number;
}

export interface LyricsConfig {
  position: "left" | "center" | "right";
  offsetX: number;
  offsetY: number;
  widthPercent: number;
  verticalAlign: "top" | "center" | "bottom";
  textAlign: "left" | "center" | "right";
  fontFamily: string;
  activeFontSize: number;
  inactiveFontSize: number;
  lineSpacing: number;
  letterSpacing: number;
  activeColor: string;
  activeWeight: number;
  inactiveOpacity: number;
  futureOpacity: number;
  scrollSpeed: number;
  visibleLines: number;
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
  offsetY: number;
}

export type BackgroundType = "blurred-cover" | "solid" | "gradient";

export interface BackgroundConfig {
  type: BackgroundType;
  blurAmount: number;
  brightness: number;
  overlayOpacity: number;
  solidColor: string;
  gradientFrom: string;
  gradientTo: string;
  gradientAngle: number;
}

export interface VideoConfig {
  width: number;
  height: number;
  fps: number;
}

export interface LyricAnimationConfig {
  enabled: boolean;
  activeColor: string;
  completedColor: string;
  inactiveColor: string;
  colorMode: "current-line" | "all-played";
  transitionDuration: number;
}

// --- Themes ---

export interface Theme {
  name: string;
  label: string;
  config: VisualConfig;
}
