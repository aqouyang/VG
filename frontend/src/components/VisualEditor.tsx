import React, { useState, useEffect } from "react";
import type { VisualConfig, Theme, BackgroundType, VideoConfig, LyricAnimationConfig } from "../types";
import { builtInThemes, defaultVisualConfig } from "../utils/visualDefaults";
import { api } from "../utils/api";

interface Props {
  config: VisualConfig;
  onChange: (config: VisualConfig) => void;
}

// --- Tiny reusable controls ---

const S: Record<string, React.CSSProperties> = {
  panel: {
    height: "100%", overflowY: "auto", padding: "16px 20px",
    background: "#12121a", color: "#ccc", fontSize: 13,
  },
  group: { marginBottom: 20 },
  groupTitle: {
    fontSize: 11, color: "#6c5ce7", textTransform: "uppercase",
    letterSpacing: 1.2, marginBottom: 10, fontWeight: 600,
  },
  row: { display: "flex", alignItems: "center", marginBottom: 8, gap: 8 },
  label: { width: 100, flexShrink: 0, fontSize: 12, color: "#888" },
  slider: { flex: 1, accentColor: "#6c5ce7", height: 4 },
  numInput: {
    width: 56, background: "#0a0a14", border: "1px solid #2a2a3a",
    borderRadius: 4, color: "#ddd", padding: "3px 6px", fontSize: 12,
    textAlign: "right" as const, outline: "none",
  },
  select: {
    flex: 1, background: "#0a0a14", border: "1px solid #2a2a3a",
    borderRadius: 4, color: "#ddd", padding: "4px 8px", fontSize: 12, outline: "none",
  },
  colorInput: {
    width: 32, height: 24, border: "1px solid #333", borderRadius: 4,
    background: "none", cursor: "pointer", padding: 0,
  },
  textInput: {
    flex: 1, background: "#0a0a14", border: "1px solid #2a2a3a",
    borderRadius: 4, color: "#ddd", padding: "4px 8px", fontSize: 12, outline: "none",
  },
  btn: {
    background: "#6c5ce7", color: "#fff", border: "none", padding: "6px 14px",
    borderRadius: 5, cursor: "pointer", fontSize: 12, fontWeight: 500,
  },
  btnSmall: {
    background: "#2a2a3a", color: "#ccc", border: "none", padding: "4px 10px",
    borderRadius: 4, cursor: "pointer", fontSize: 11,
  },
  themeCard: {
    padding: "8px 12px", borderRadius: 6, cursor: "pointer",
    border: "1px solid #2a2a3a", marginBottom: 6, fontSize: 12,
  },
  checkbox: {
    accentColor: "#6c5ce7", width: 16, height: 16, cursor: "pointer",
  },
};

function Slider({ label, value, min, max, step, onChange }: {
  label: string; value: number; min: number; max: number; step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={S.row}>
      <span style={S.label}>{label}</span>
      <input
        type="range" min={min} max={max} step={step ?? 1}
        value={value} onChange={(e) => onChange(parseFloat(e.target.value))}
        style={S.slider}
      />
      <input
        type="number" value={value} step={step ?? 1} min={min} max={max}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        style={S.numInput}
      />
    </div>
  );
}

function Select({ label, value, options, onChange }: {
  label: string; value: string; options: { v: string; l: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div style={S.row}>
      <span style={S.label}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={S.select}>
        {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </div>
  );
}

function ColorRow({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  // For rgba strings, show a text field; for hex show picker
  const isHex = value.startsWith("#");
  return (
    <div style={S.row}>
      <span style={S.label}>{label}</span>
      {isHex ? (
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} style={S.colorInput} />
      ) : null}
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} style={S.textInput} />
    </div>
  );
}

function TextRow({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div style={S.row}>
      <span style={S.label}>{label}</span>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} style={S.textInput} />
    </div>
  );
}

const POSITIONS = [
  { v: "left", l: "Left" }, { v: "center", l: "Center" }, { v: "right", l: "Right" },
];

const TITLE_POSITIONS = [
  { v: "below-cover", l: "Below Cover" },
  { v: "top-left", l: "Top Left" },
  { v: "top-right", l: "Top Right" },
  { v: "top-center", l: "Top Center" },
  { v: "bottom-center", l: "Bottom Center" },
];

const VALIGN = [
  { v: "top", l: "Top" }, { v: "center", l: "Center" }, { v: "bottom", l: "Bottom" },
];

const BG_TYPES = [
  { v: "blurred-cover", l: "Blurred Cover" },
  { v: "solid", l: "Solid Color" },
  { v: "gradient", l: "Gradient" },
];

const FONT_PRESETS = [
  "Inter, Helvetica Neue, Arial, sans-serif",
  "Georgia, Times New Roman, serif",
  "Helvetica Neue, Helvetica, Arial, sans-serif",
  "Courier New, monospace",
  "Futura, sans-serif",
  "Palatino, serif",
];

// --- Video presets ---

interface AspectRatioPreset {
  label: string;
  width: number;
  height: number;
}

const ASPECT_RATIO_PRESETS: AspectRatioPreset[] = [
  { label: "16:9 YouTube", width: 1920, height: 1080 },
  { label: "9:16 TikTok", width: 1080, height: 1920 },
  { label: "1:1 Square", width: 1080, height: 1080 },
  { label: "4:3 Classic", width: 1440, height: 1080 },
];

interface ResolutionPreset {
  label: string;
  scale: number; // multiplier relative to base resolution
}

const RESOLUTION_PRESETS: ResolutionPreset[] = [
  { label: "720p", scale: 720 },
  { label: "1080p", scale: 1080 },
  { label: "1440p", scale: 1440 },
  { label: "4K", scale: 2160 },
];

const FPS_OPTIONS = [
  { v: "24", l: "24 fps" },
  { v: "30", l: "30 fps" },
  { v: "60", l: "60 fps" },
];

// --- Default fallbacks for new config sections ---

const DEFAULT_VIDEO: VideoConfig = {
  width: 1920,
  height: 1080,
  fps: 30,
};

const DEFAULT_LYRIC_ANIMATION: LyricAnimationConfig = {
  enabled: false,
  activeColor: "#ffcc00",
  completedColor: "#888888",
  transitionDuration: 2,
};

export default function VisualEditor({ config, onChange }: Props) {
  const [savedThemes, setSavedThemes] = useState<Theme[]>([]);
  const [themeName, setThemeName] = useState("");
  const [activeSection, setActiveSection] = useState<string | null>("templates");

  // Safe accessors with fallbacks for new config sections
  const video: VideoConfig = config.video ?? DEFAULT_VIDEO;
  const lyricAnimation: LyricAnimationConfig = config.lyricAnimation ?? DEFAULT_LYRIC_ANIMATION;
  const letterSpacing: number = config.lyrics.letterSpacing ?? 0;

  useEffect(() => {
    api.listThemes().then(setSavedThemes).catch(() => {});
  }, []);

  // Helper to deeply update a nested config key
  function set<K extends keyof VisualConfig>(
    section: K,
    key: keyof VisualConfig[K],
    value: VisualConfig[K][keyof VisualConfig[K]]
  ) {
    onChange({
      ...config,
      [section]: { ...config[section], [key]: value },
    });
  }

  function setVideo(key: keyof VideoConfig, value: number) {
    onChange({
      ...config,
      video: { ...video, [key]: value },
    });
  }

  function setVideoFull(updates: Partial<VideoConfig>) {
    onChange({
      ...config,
      video: { ...video, ...updates },
    });
  }

  function setLyricAnimation(key: keyof LyricAnimationConfig, value: boolean | string | number) {
    onChange({
      ...config,
      lyricAnimation: { ...lyricAnimation, [key]: value },
    });
  }

  const applyTheme = (t: Theme) => onChange({ ...t.config });

  const saveTheme = async () => {
    const name = themeName.trim().replace(/\s+/g, "_").toLowerCase();
    if (!name) return;
    await api.saveTheme(name, themeName.trim(), config);
    const list = await api.listThemes();
    setSavedThemes(list);
    setThemeName("");
  };

  const deleteTheme = async (name: string) => {
    await api.deleteTheme(name);
    setSavedThemes(savedThemes.filter((t) => t.name !== name));
  };

  const allThemes = [...builtInThemes, ...savedThemes];

  const toggleSection = (s: string) => setActiveSection(activeSection === s ? null : s);
  const sectionOpen = (s: string) => activeSection === s;

  // Compute the current aspect ratio for resolution scaling
  const aspectRatio = video.width / video.height;

  const applyAspectRatio = (preset: AspectRatioPreset) => {
    setVideoFull({ width: preset.width, height: preset.height });
  };

  const applyResolution = (scale: number) => {
    // Scale based on the shorter dimension matching the resolution preset
    if (video.width <= video.height) {
      // Portrait or square: width is the shorter side
      const newWidth = scale;
      const newHeight = Math.round(newWidth / aspectRatio);
      setVideoFull({ width: newWidth, height: newHeight });
    } else {
      // Landscape: height is the shorter side
      const newHeight = scale;
      const newWidth = Math.round(newHeight * aspectRatio);
      setVideoFull({ width: newWidth, height: newHeight });
    }
  };

  // Determine which aspect ratio preset is currently active (if any)
  const activeAspectPreset = ASPECT_RATIO_PRESETS.find(
    (p) => p.width === video.width && p.height === video.height
  );

  // Determine which resolution preset is currently active (if any)
  const activeResolution = (() => {
    const shorter = Math.min(video.width, video.height);
    const match = RESOLUTION_PRESETS.find((p) => p.scale === shorter);
    // Also check if the longer dimension matches proportionally
    if (match) {
      const longer = Math.max(video.width, video.height);
      const expectedLonger = Math.round(match.scale * Math.max(aspectRatio, 1 / aspectRatio));
      if (Math.abs(longer - expectedLonger) <= 1) return match;
    }
    return null;
  })();

  return (
    <div style={S.panel}>
      {/* Templates (renamed from Themes) */}
      <div style={S.group}>
        <div style={{ ...S.groupTitle, cursor: "pointer" }} onClick={() => toggleSection("templates")}>
          {sectionOpen("templates") ? "\u25BE" : "\u25B8"} Templates
        </div>
        {sectionOpen("templates") && (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
              {allThemes.map((t) => (
                <div key={t.name} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <button style={S.btnSmall} onClick={() => applyTheme(t)}>
                    {t.label}
                  </button>
                  {!builtInThemes.find((b) => b.name === t.name) && (
                    <button
                      style={{ ...S.btnSmall, color: "#c87e7e", padding: "4px 6px" }}
                      onClick={() => deleteTheme(t.name)}
                      title="Delete"
                    >
                      x
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div style={{ ...S.row, gap: 6 }}>
              <input
                style={S.textInput}
                placeholder="Template name"
                value={themeName}
                onChange={(e) => setThemeName(e.target.value)}
              />
              <button style={S.btn} onClick={saveTheme}>Save</button>
            </div>
            <button
              style={{ ...S.btnSmall, marginTop: 6 }}
              onClick={() => onChange({ ...defaultVisualConfig })}
            >
              Reset to Default
            </button>
          </>
        )}
      </div>

      {/* Cover */}
      <div style={S.group}>
        <div style={{ ...S.groupTitle, cursor: "pointer" }} onClick={() => toggleSection("cover")}>
          {sectionOpen("cover") ? "\u25BE" : "\u25B8"} Cover
        </div>
        {sectionOpen("cover") && (
          <>
            <Select label="Position" value={config.cover.position} options={POSITIONS}
              onChange={(v) => set("cover", "position", v as any)} />
            <Slider label="X Offset" value={config.cover.offsetX} min={-400} max={400}
              onChange={(v) => set("cover", "offsetX", v)} />
            <Slider label="Y Offset" value={config.cover.offsetY} min={-400} max={400}
              onChange={(v) => set("cover", "offsetY", v)} />
            <Slider label="Size %" value={config.cover.widthPercent} min={5} max={60}
              onChange={(v) => set("cover", "widthPercent", v)} />
            <Slider label="Radius" value={config.cover.borderRadius} min={0} max={100}
              onChange={(v) => set("cover", "borderRadius", v)} />
            <Slider label="Shadow" value={config.cover.shadowIntensity} min={0} max={1} step={0.05}
              onChange={(v) => set("cover", "shadowIntensity", v)} />
          </>
        )}
      </div>

      {/* Lyrics */}
      <div style={S.group}>
        <div style={{ ...S.groupTitle, cursor: "pointer" }} onClick={() => toggleSection("lyrics")}>
          {sectionOpen("lyrics") ? "\u25BE" : "\u25B8"} Lyrics
        </div>
        {sectionOpen("lyrics") && (
          <>
            <Select label="Position" value={config.lyrics.position} options={POSITIONS}
              onChange={(v) => set("lyrics", "position", v as any)} />
            <Slider label="X Offset" value={config.lyrics.offsetX} min={-400} max={400}
              onChange={(v) => set("lyrics", "offsetX", v)} />
            <Slider label="Y Offset" value={config.lyrics.offsetY} min={-400} max={400}
              onChange={(v) => set("lyrics", "offsetY", v)} />
            <Slider label="Width %" value={config.lyrics.widthPercent} min={10} max={80}
              onChange={(v) => set("lyrics", "widthPercent", v)} />
            <Select label="V. Align" value={config.lyrics.verticalAlign} options={VALIGN}
              onChange={(v) => set("lyrics", "verticalAlign", v as any)} />
            <Select label="Text Align" value={config.lyrics.textAlign} options={POSITIONS}
              onChange={(v) => set("lyrics", "textAlign", v as any)} />
            <Select label="Font" value={config.lyrics.fontFamily}
              options={FONT_PRESETS.map((f) => ({ v: f, l: f.split(",")[0] }))}
              onChange={(v) => set("lyrics", "fontFamily", v)} />
            <Slider label="Active Size" value={config.lyrics.activeFontSize} min={14} max={72}
              onChange={(v) => set("lyrics", "activeFontSize", v)} />
            <Slider label="Inactive Size" value={config.lyrics.inactiveFontSize} min={10} max={60}
              onChange={(v) => set("lyrics", "inactiveFontSize", v)} />
            <Slider label="Line Space" value={config.lyrics.lineSpacing} min={20} max={120}
              onChange={(v) => set("lyrics", "lineSpacing", v)} />
            <Slider label="Letter Space" value={letterSpacing} min={-2} max={5} step={0.1}
              onChange={(v) => set("lyrics", "letterSpacing", v)} />
            <ColorRow label="Active Color" value={config.lyrics.activeColor}
              onChange={(v) => set("lyrics", "activeColor", v)} />
            <Slider label="Active Weight" value={config.lyrics.activeWeight} min={100} max={900} step={100}
              onChange={(v) => set("lyrics", "activeWeight", v)} />
            <Slider label="Past Opacity" value={config.lyrics.inactiveOpacity} min={0} max={1} step={0.05}
              onChange={(v) => set("lyrics", "inactiveOpacity", v)} />
            <Slider label="Future Opacity" value={config.lyrics.futureOpacity} min={0} max={1} step={0.05}
              onChange={(v) => set("lyrics", "futureOpacity", v)} />
            <Slider label="Scroll Speed" value={config.lyrics.scrollSpeed} min={0.1} max={1} step={0.05}
              onChange={(v) => set("lyrics", "scrollSpeed", v)} />
            <Slider label="Visible Lines" value={config.lyrics.visibleLines} min={2} max={10}
              onChange={(v) => set("lyrics", "visibleLines", v)} />
          </>
        )}
      </div>

      {/* Title */}
      <div style={S.group}>
        <div style={{ ...S.groupTitle, cursor: "pointer" }} onClick={() => toggleSection("title")}>
          {sectionOpen("title") ? "\u25BE" : "\u25B8"} Title
        </div>
        {sectionOpen("title") && (
          <>
            <Select label="Position" value={config.title.position} options={TITLE_POSITIONS}
              onChange={(v) => set("title", "position", v as any)} />
            <Select label="Font" value={config.title.fontFamily}
              options={FONT_PRESETS.map((f) => ({ v: f, l: f.split(",")[0] }))}
              onChange={(v) => set("title", "fontFamily", v)} />
            <Slider label="Size" value={config.title.fontSize} min={12} max={80}
              onChange={(v) => set("title", "fontSize", v)} />
            <Slider label="Weight" value={config.title.fontWeight} min={100} max={900} step={100}
              onChange={(v) => set("title", "fontWeight", v)} />
            <ColorRow label="Color" value={config.title.color}
              onChange={(v) => set("title", "color", v)} />
            <Slider label="Opacity" value={config.title.opacity} min={0} max={1} step={0.05}
              onChange={(v) => set("title", "opacity", v)} />
            <Slider label="X Offset" value={config.title.offsetX} min={-400} max={400}
              onChange={(v) => set("title", "offsetX", v)} />
            <Slider label="Y Offset" value={config.title.offsetY} min={-200} max={400}
              onChange={(v) => set("title", "offsetY", v)} />
          </>
        )}
      </div>

      {/* Artist */}
      <div style={S.group}>
        <div style={{ ...S.groupTitle, cursor: "pointer" }} onClick={() => toggleSection("artist")}>
          {sectionOpen("artist") ? "\u25BE" : "\u25B8"} Artist
        </div>
        {sectionOpen("artist") && (
          <>
            <Select label="Font" value={config.artist.fontFamily}
              options={FONT_PRESETS.map((f) => ({ v: f, l: f.split(",")[0] }))}
              onChange={(v) => set("artist", "fontFamily", v)} />
            <Slider label="Size" value={config.artist.fontSize} min={10} max={48}
              onChange={(v) => set("artist", "fontSize", v)} />
            <Slider label="Weight" value={config.artist.fontWeight} min={100} max={900} step={100}
              onChange={(v) => set("artist", "fontWeight", v)} />
            <ColorRow label="Color" value={config.artist.color}
              onChange={(v) => set("artist", "color", v)} />
            <Slider label="Opacity" value={config.artist.opacity} min={0} max={1} step={0.05}
              onChange={(v) => set("artist", "opacity", v)} />
            <Slider label="Gap below title" value={config.artist.offsetY} min={0} max={60}
              onChange={(v) => set("artist", "offsetY", v)} />
          </>
        )}
      </div>

      {/* Background */}
      <div style={S.group}>
        <div style={{ ...S.groupTitle, cursor: "pointer" }} onClick={() => toggleSection("bg")}>
          {sectionOpen("bg") ? "\u25BE" : "\u25B8"} Background
        </div>
        {sectionOpen("bg") && (
          <>
            <Select label="Type" value={config.background.type} options={BG_TYPES}
              onChange={(v) => set("background", "type", v as BackgroundType)} />
            {config.background.type === "blurred-cover" && (
              <>
                <Slider label="Blur" value={config.background.blurAmount} min={0} max={200}
                  onChange={(v) => set("background", "blurAmount", v)} />
                <Slider label="Brightness" value={config.background.brightness} min={0} max={1} step={0.02}
                  onChange={(v) => set("background", "brightness", v)} />
              </>
            )}
            {config.background.type === "solid" && (
              <ColorRow label="Color" value={config.background.solidColor}
                onChange={(v) => set("background", "solidColor", v)} />
            )}
            {config.background.type === "gradient" && (
              <>
                <ColorRow label="From" value={config.background.gradientFrom}
                  onChange={(v) => set("background", "gradientFrom", v)} />
                <ColorRow label="To" value={config.background.gradientTo}
                  onChange={(v) => set("background", "gradientTo", v)} />
                <Slider label="Angle" value={config.background.gradientAngle} min={0} max={360}
                  onChange={(v) => set("background", "gradientAngle", v)} />
              </>
            )}
            <Slider label="Overlay" value={config.background.overlayOpacity} min={0} max={1} step={0.05}
              onChange={(v) => set("background", "overlayOpacity", v)} />
          </>
        )}
      </div>

      {/* Video */}
      <div style={S.group}>
        <div style={{ ...S.groupTitle, cursor: "pointer" }} onClick={() => toggleSection("video")}>
          {sectionOpen("video") ? "\u25BE" : "\u25B8"} Video
        </div>
        {sectionOpen("video") && (
          <>
            {/* Aspect Ratio Presets */}
            <div style={S.row}>
              <span style={S.label}>Aspect Ratio</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, flex: 1 }}>
                {ASPECT_RATIO_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    style={{
                      ...S.btnSmall,
                      background: activeAspectPreset?.label === preset.label ? "#6c5ce7" : "#2a2a3a",
                      color: activeAspectPreset?.label === preset.label ? "#fff" : "#ccc",
                    }}
                    onClick={() => applyAspectRatio(preset)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Resolution Presets */}
            <div style={S.row}>
              <span style={S.label}>Resolution</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, flex: 1 }}>
                {RESOLUTION_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    style={{
                      ...S.btnSmall,
                      background: activeResolution?.label === preset.label ? "#6c5ce7" : "#2a2a3a",
                      color: activeResolution?.label === preset.label ? "#fff" : "#ccc",
                    }}
                    onClick={() => applyResolution(preset.scale)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* FPS */}
            <Select label="FPS" value={String(video.fps)} options={FPS_OPTIONS}
              onChange={(v) => setVideo("fps", parseInt(v, 10))} />

            {/* Custom Width */}
            <div style={S.row}>
              <span style={S.label}>Width</span>
              <input
                type="number" value={video.width} min={320} max={7680} step={1}
                onChange={(e) => setVideo("width", parseInt(e.target.value, 10) || 1920)}
                style={{ ...S.numInput, width: 80 }}
              />
            </div>

            {/* Custom Height */}
            <div style={S.row}>
              <span style={S.label}>Height</span>
              <input
                type="number" value={video.height} min={320} max={7680} step={1}
                onChange={(e) => setVideo("height", parseInt(e.target.value, 10) || 1080)}
                style={{ ...S.numInput, width: 80 }}
              />
            </div>

            {/* Display current resolution info */}
            <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>
              {video.width} x {video.height} @ {video.fps}fps
            </div>
          </>
        )}
      </div>

      {/* Lyric Animation */}
      <div style={S.group}>
        <div style={{ ...S.groupTitle, cursor: "pointer" }} onClick={() => toggleSection("lyricAnimation")}>
          {sectionOpen("lyricAnimation") ? "\u25BE" : "\u25B8"} Lyric Animation
        </div>
        {sectionOpen("lyricAnimation") && (
          <>
            {/* Enable toggle */}
            <div style={S.row}>
              <span style={S.label}>Enabled</span>
              <input
                type="checkbox"
                checked={lyricAnimation.enabled}
                onChange={(e) => setLyricAnimation("enabled", e.target.checked)}
                style={S.checkbox}
              />
            </div>

            {/* Active color */}
            <ColorRow label="Active Color" value={lyricAnimation.activeColor}
              onChange={(v) => setLyricAnimation("activeColor", v)} />

            {/* Completed color */}
            <ColorRow label="Done Color" value={lyricAnimation.completedColor}
              onChange={(v) => setLyricAnimation("completedColor", v)} />

            {/* Transition duration */}
            <Slider label="Duration (s)" value={lyricAnimation.transitionDuration}
              min={0.5} max={5} step={0.1}
              onChange={(v) => setLyricAnimation("transitionDuration", v)} />
          </>
        )}
      </div>
    </div>
  );
}
