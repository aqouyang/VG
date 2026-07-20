import React, { useState, useEffect } from "react";
import type { VisualConfig, Theme, BackgroundType, VideoConfig, LyricAnimationConfig } from "../types";
import { builtInThemes, defaultVisualConfig } from "../utils/visualDefaults";
import { api } from "../utils/api";

interface Props {
  config: VisualConfig;
  onChange: (config: VisualConfig) => void;
}

/* ── Spacing tokens ────────────────────────────────────────────────── */
const T = { xs: 4, sm: 6, md: 10, lg: 14, xl: 18 };

/* ── Shared styles ─────────────────────────────────────────────────── */
const base: React.CSSProperties = {
  background: "#0c0c16", border: "1px solid #222230", borderRadius: 4,
  color: "#ccc", fontSize: 12, outline: "none", boxSizing: "border-box",
};

/* ── Reusable controls (all constrained to parent width) ───────────── */

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: T.sm, marginBottom: T.sm }}>
      <span style={{ width: 80, flexShrink: 0, fontSize: 11, color: "#777", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: T.xs }}>{children}</div>
    </div>
  );
}

function SliderRow({ label, value, min, max, step, onChange }: {
  label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void;
}) {
  return (
    <Row label={label}>
      <input type="range" min={min} max={max} step={step ?? 1} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ flex: 1, accentColor: "#6c5ce7", height: 3, minWidth: 0 }} />
      <input type="number" value={value} step={step ?? 1} min={min} max={max}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        style={{ ...base, width: 48, padding: "2px 4px", textAlign: "right", flexShrink: 0 }} />
    </Row>
  );
}

function SelectRow({ label, value, options, onChange }: {
  label: string; value: string; options: { v: string; l: string }[]; onChange: (v: string) => void;
}) {
  return (
    <Row label={label}>
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ ...base, flex: 1, minWidth: 0, padding: "3px 6px" }}>
        {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </Row>
  );
}

function ColorInput({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  const isHex = value.startsWith("#");
  return (
    <Row label={label}>
      {isHex && <input type="color" value={value} onChange={e => onChange(e.target.value)}
        style={{ width: 26, height: 20, border: "1px solid #333", borderRadius: 3, background: "none", cursor: "pointer", padding: 0, flexShrink: 0 }} />}
      <input type="text" value={value} onChange={e => onChange(e.target.value)}
        style={{ ...base, flex: 1, minWidth: 0, padding: "2px 6px" }} />
    </Row>
  );
}

/* ── Section header ────────────────────────────────────────────────── */
function SectionHead({ label, open, onClick }: { label: string; open: boolean; onClick: () => void }) {
  return (
    <div onClick={onClick} style={{
      fontSize: 10, color: "#6c5ce7", textTransform: "uppercase", letterSpacing: 1.1,
      fontWeight: 600, cursor: "pointer", padding: `${T.md}px 0 ${T.sm}px`,
      borderBottom: "1px solid #1a1a28", marginBottom: T.md,
      display: "flex", alignItems: "center", gap: T.sm, userSelect: "none",
    }}>
      <span style={{ fontSize: 8 }}>{open ? "\u25BC" : "\u25B6"}</span>{label}
    </div>
  );
}

/* ── Constants ─────────────────────────────────────────────────────── */
const POS3 = [{ v: "left", l: "Left" }, { v: "center", l: "Center" }, { v: "right", l: "Right" }];
const TITLE_POS = [
  { v: "below-cover", l: "Below Cover" }, { v: "top-left", l: "Top Left" },
  { v: "top-right", l: "Top Right" }, { v: "top-center", l: "Top Center" },
  { v: "bottom-center", l: "Bottom Center" },
];
const VALIGN = [{ v: "top", l: "Top" }, { v: "center", l: "Center" }, { v: "bottom", l: "Bottom" }];
const BG_TYPES = [{ v: "blurred-cover", l: "Blurred Cover" }, { v: "solid", l: "Solid Color" }, { v: "gradient", l: "Gradient" }];
const FONTS = [
  "Inter, Helvetica Neue, Arial, sans-serif",
  "Georgia, Times New Roman, serif",
  "Helvetica Neue, Helvetica, Arial, sans-serif",
  "Courier New, monospace",
  "Palatino, serif",
];
const ASPECT_PRESETS = [
  { l: "16:9", w: 1920, h: 1080 }, { l: "9:16", w: 1080, h: 1920 },
  { l: "1:1", w: 1080, h: 1080 }, { l: "4:3", w: 1440, h: 1080 },
];
const FPS_OPTS = [{ v: "24", l: "24" }, { v: "30", l: "30" }, { v: "60", l: "60" }];

const DEFAULT_VIDEO: VideoConfig = { width: 1920, height: 1080, fps: 30 };
const DEFAULT_ANIM: LyricAnimationConfig = {
  enabled: false, activeColor: "#6c5ce7", completedColor: "#888888",
  inactiveColor: "#ffffff", colorMode: "current-line", transitionDuration: 2,
};

/* ── Main component ────────────────────────────────────────────────── */
export default function VisualEditor({ config, onChange }: Props) {
  const [savedThemes, setSavedThemes] = useState<Theme[]>([]);
  const [themeName, setThemeName] = useState("");
  const [open, setOpen] = useState<string | null>("templates");

  useEffect(() => { api.listThemes().then(setSavedThemes).catch(() => {}); }, []);

  function set<K extends keyof VisualConfig>(section: K, key: keyof VisualConfig[K], value: any) {
    onChange({ ...config, [section]: { ...config[section], [key]: value } });
  }
  const video: VideoConfig = config.video ?? DEFAULT_VIDEO;
  const anim: LyricAnimationConfig = config.lyricAnimation ?? DEFAULT_ANIM;
  function setVideo(key: keyof VideoConfig, v: number) {
    onChange({ ...config, video: { ...video, [key]: v } });
  }
  function setAnim(key: keyof LyricAnimationConfig, v: any) {
    onChange({ ...config, lyricAnimation: { ...anim, [key]: v } });
  }

  const toggle = (s: string) => setOpen(open === s ? null : s);
  const isOpen = (s: string) => open === s;

  const allThemes = [...builtInThemes, ...savedThemes];
  const applyTheme = (t: Theme) => onChange({ ...t.config });
  const saveTheme = async () => {
    const n = themeName.trim().replace(/\s+/g, "_").toLowerCase();
    if (!n) return;
    await api.saveTheme(n, themeName.trim(), config);
    setSavedThemes(await api.listThemes());
    setThemeName("");
  };
  const deleteTheme = async (n: string) => {
    await api.deleteTheme(n);
    setSavedThemes(s => s.filter(t => t.name !== n));
  };

  return (
    <div style={{
      height: "100%", overflowY: "auto", overflowX: "hidden",
      padding: `${T.sm}px ${T.lg}px`, background: "#111118", color: "#ccc", fontSize: 12,
      boxSizing: "border-box",
    }}>

      {/* Templates */}
      <SectionHead label="Templates" open={isOpen("templates")} onClick={() => toggle("templates")} />
      {isOpen("templates") && (
        <div style={{ marginBottom: T.xl }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: T.xs, marginBottom: T.md }}>
            {allThemes.map(t => (
              <div key={t.name} style={{ display: "flex", alignItems: "center", gap: 2 }}>
                <button onClick={() => applyTheme(t)} style={{
                  background: "#1a1a28", color: "#bbb", border: "1px solid #2a2a3a",
                  padding: "3px 8px", borderRadius: 4, cursor: "pointer", fontSize: 11,
                }}>{t.label}</button>
                {!builtInThemes.find(b => b.name === t.name) && (
                  <button onClick={() => deleteTheme(t.name)} style={{
                    background: "none", border: "none", color: "#664", cursor: "pointer", fontSize: 10, padding: "2px 4px",
                  }}>x</button>
                )}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: T.xs }}>
            <input value={themeName} onChange={e => setThemeName(e.target.value)} placeholder="Template name"
              style={{ ...base, flex: 1, minWidth: 0, padding: "3px 6px" }} />
            <button onClick={saveTheme} style={{
              background: "#6c5ce7", color: "#fff", border: "none", padding: "3px 10px",
              borderRadius: 4, cursor: "pointer", fontSize: 11, fontWeight: 500, flexShrink: 0,
            }}>Save</button>
          </div>
          <button onClick={() => onChange({ ...defaultVisualConfig })} style={{
            background: "none", border: "none", color: "#555", cursor: "pointer", fontSize: 11, marginTop: T.sm,
          }}>Reset to default</button>
        </div>
      )}

      {/* Cover */}
      <SectionHead label="Cover" open={isOpen("cover")} onClick={() => toggle("cover")} />
      {isOpen("cover") && (
        <div style={{ marginBottom: T.xl }}>
          <SelectRow label="Position" value={config.cover.position} options={POS3} onChange={v => set("cover", "position", v)} />
          <SliderRow label="X Offset" value={config.cover.offsetX} min={-400} max={400} onChange={v => set("cover", "offsetX", v)} />
          <SliderRow label="Y Offset" value={config.cover.offsetY} min={-400} max={400} onChange={v => set("cover", "offsetY", v)} />
          <SliderRow label="Size %" value={config.cover.widthPercent} min={5} max={60} onChange={v => set("cover", "widthPercent", v)} />
          <SliderRow label="Radius" value={config.cover.borderRadius} min={0} max={100} onChange={v => set("cover", "borderRadius", v)} />
          <SliderRow label="Shadow" value={config.cover.shadowIntensity} min={0} max={1} step={0.05} onChange={v => set("cover", "shadowIntensity", v)} />
        </div>
      )}

      {/* Lyrics */}
      <SectionHead label="Lyrics" open={isOpen("lyrics")} onClick={() => toggle("lyrics")} />
      {isOpen("lyrics") && (
        <div style={{ marginBottom: T.xl }}>
          <SelectRow label="Position" value={config.lyrics.position} options={POS3} onChange={v => set("lyrics", "position", v)} />
          <SliderRow label="X Offset" value={config.lyrics.offsetX} min={-400} max={400} onChange={v => set("lyrics", "offsetX", v)} />
          <SliderRow label="Y Offset" value={config.lyrics.offsetY} min={-400} max={400} onChange={v => set("lyrics", "offsetY", v)} />
          <SliderRow label="Width %" value={config.lyrics.widthPercent} min={10} max={80} onChange={v => set("lyrics", "widthPercent", v)} />
          <SelectRow label="V. Align" value={config.lyrics.verticalAlign} options={VALIGN} onChange={v => set("lyrics", "verticalAlign", v)} />
          <SelectRow label="Text Align" value={config.lyrics.textAlign} options={POS3} onChange={v => set("lyrics", "textAlign", v)} />
          <SelectRow label="Font" value={config.lyrics.fontFamily} options={FONTS.map(f => ({ v: f, l: f.split(",")[0] }))} onChange={v => set("lyrics", "fontFamily", v)} />
          <SliderRow label="Active Size" value={config.lyrics.activeFontSize} min={14} max={72} onChange={v => set("lyrics", "activeFontSize", v)} />
          <SliderRow label="Inactive Size" value={config.lyrics.inactiveFontSize} min={10} max={60} onChange={v => set("lyrics", "inactiveFontSize", v)} />
          <SliderRow label="Line Space" value={config.lyrics.lineSpacing} min={20} max={120} onChange={v => set("lyrics", "lineSpacing", v)} />
          <SliderRow label="Letter Sp." value={config.lyrics.letterSpacing ?? 0} min={-2} max={5} step={0.1} onChange={v => set("lyrics", "letterSpacing", v)} />
          <ColorInput label="Active Color" value={config.lyrics.activeColor} onChange={v => set("lyrics", "activeColor", v)} />
          <SliderRow label="Active Wt" value={config.lyrics.activeWeight} min={100} max={900} step={100} onChange={v => set("lyrics", "activeWeight", v)} />
          <SliderRow label="Past Opacity" value={config.lyrics.inactiveOpacity} min={0} max={1} step={0.05} onChange={v => set("lyrics", "inactiveOpacity", v)} />
          <SliderRow label="Future Op." value={config.lyrics.futureOpacity} min={0} max={1} step={0.05} onChange={v => set("lyrics", "futureOpacity", v)} />
          <SliderRow label="Scroll Spd" value={config.lyrics.scrollSpeed} min={0.1} max={1} step={0.05} onChange={v => set("lyrics", "scrollSpeed", v)} />
          <SliderRow label="Vis. Lines" value={config.lyrics.visibleLines} min={2} max={10} onChange={v => set("lyrics", "visibleLines", v)} />
        </div>
      )}

      {/* Title */}
      <SectionHead label="Title" open={isOpen("title")} onClick={() => toggle("title")} />
      {isOpen("title") && (
        <div style={{ marginBottom: T.xl }}>
          <SelectRow label="Position" value={config.title.position} options={TITLE_POS} onChange={v => set("title", "position", v)} />
          <SelectRow label="Font" value={config.title.fontFamily} options={FONTS.map(f => ({ v: f, l: f.split(",")[0] }))} onChange={v => set("title", "fontFamily", v)} />
          <SliderRow label="Size" value={config.title.fontSize} min={12} max={80} onChange={v => set("title", "fontSize", v)} />
          <SliderRow label="Weight" value={config.title.fontWeight} min={100} max={900} step={100} onChange={v => set("title", "fontWeight", v)} />
          <ColorInput label="Color" value={config.title.color} onChange={v => set("title", "color", v)} />
          <SliderRow label="Opacity" value={config.title.opacity} min={0} max={1} step={0.05} onChange={v => set("title", "opacity", v)} />
          <SliderRow label="X Offset" value={config.title.offsetX} min={-400} max={400} onChange={v => set("title", "offsetX", v)} />
          <SliderRow label="Y Offset" value={config.title.offsetY} min={-200} max={400} onChange={v => set("title", "offsetY", v)} />
        </div>
      )}

      {/* Artist */}
      <SectionHead label="Artist" open={isOpen("artist")} onClick={() => toggle("artist")} />
      {isOpen("artist") && (
        <div style={{ marginBottom: T.xl }}>
          <SelectRow label="Font" value={config.artist.fontFamily} options={FONTS.map(f => ({ v: f, l: f.split(",")[0] }))} onChange={v => set("artist", "fontFamily", v)} />
          <SliderRow label="Size" value={config.artist.fontSize} min={10} max={48} onChange={v => set("artist", "fontSize", v)} />
          <SliderRow label="Weight" value={config.artist.fontWeight} min={100} max={900} step={100} onChange={v => set("artist", "fontWeight", v)} />
          <ColorInput label="Color" value={config.artist.color} onChange={v => set("artist", "color", v)} />
          <SliderRow label="Opacity" value={config.artist.opacity} min={0} max={1} step={0.05} onChange={v => set("artist", "opacity", v)} />
          <SliderRow label="Gap" value={config.artist.offsetY} min={0} max={60} onChange={v => set("artist", "offsetY", v)} />
        </div>
      )}

      {/* Background */}
      <SectionHead label="Background" open={isOpen("bg")} onClick={() => toggle("bg")} />
      {isOpen("bg") && (
        <div style={{ marginBottom: T.xl }}>
          <SelectRow label="Type" value={config.background.type} options={BG_TYPES} onChange={v => set("background", "type", v as BackgroundType)} />
          {config.background.type === "blurred-cover" && (
            <>
              <SliderRow label="Blur" value={config.background.blurAmount} min={0} max={200} onChange={v => set("background", "blurAmount", v)} />
              <SliderRow label="Brightness" value={config.background.brightness} min={0} max={1} step={0.02} onChange={v => set("background", "brightness", v)} />
            </>
          )}
          {config.background.type === "solid" && (
            <ColorInput label="Color" value={config.background.solidColor} onChange={v => set("background", "solidColor", v)} />
          )}
          {config.background.type === "gradient" && (
            <>
              <ColorInput label="From" value={config.background.gradientFrom} onChange={v => set("background", "gradientFrom", v)} />
              <ColorInput label="To" value={config.background.gradientTo} onChange={v => set("background", "gradientTo", v)} />
              <SliderRow label="Angle" value={config.background.gradientAngle} min={0} max={360} onChange={v => set("background", "gradientAngle", v)} />
            </>
          )}
          <SliderRow label="Overlay" value={config.background.overlayOpacity} min={0} max={1} step={0.05} onChange={v => set("background", "overlayOpacity", v)} />
        </div>
      )}

      {/* Video */}
      <SectionHead label="Video" open={isOpen("video")} onClick={() => toggle("video")} />
      {isOpen("video") && (
        <div style={{ marginBottom: T.xl }}>
          <Row label="Aspect">
            <div style={{ display: "flex", gap: T.xs, flex: 1 }}>
              {ASPECT_PRESETS.map(p => (
                <button key={p.l} onClick={() => { setVideo("width", p.w); setVideo("height", p.h); }}
                  style={{
                    flex: 1, padding: "3px 0", borderRadius: 3, fontSize: 10, cursor: "pointer",
                    background: video.width === p.w && video.height === p.h ? "#6c5ce7" : "#1a1a28",
                    color: video.width === p.w && video.height === p.h ? "#fff" : "#888",
                    border: "none",
                  }}>{p.l}</button>
              ))}
            </div>
          </Row>
          <SliderRow label="Width" value={video.width} min={640} max={3840} step={2} onChange={v => setVideo("width", v)} />
          <SliderRow label="Height" value={video.height} min={360} max={2160} step={2} onChange={v => setVideo("height", v)} />
          <SelectRow label="FPS" value={String(video.fps)} options={FPS_OPTS} onChange={v => setVideo("fps", parseInt(v))} />
        </div>
      )}

      {/* Lyric Animation */}
      <SectionHead label="Lyric Animation" open={isOpen("anim")} onClick={() => toggle("anim")} />
      {isOpen("anim") && (
        <div style={{ marginBottom: T.xl }}>
          <Row label="Enabled">
            <input type="checkbox" checked={anim.enabled} onChange={e => setAnim("enabled", e.target.checked)}
              style={{ accentColor: "#6c5ce7", width: 16, height: 16, cursor: "pointer" }} />
          </Row>
          <SelectRow label="Mode" value={anim.colorMode ?? "current-line"}
            options={[{ v: "current-line", l: "Current line" }, { v: "all-played", l: "All played" }]}
            onChange={v => setAnim("colorMode", v)} />
          <ColorInput label="Singing" value={anim.activeColor} onChange={v => setAnim("activeColor", v)} />
          <ColorInput label="Completed" value={anim.completedColor} onChange={v => setAnim("completedColor", v)} />
          <ColorInput label="Unsung" value={anim.inactiveColor ?? "#ffffff"} onChange={v => setAnim("inactiveColor", v)} />
          <SliderRow label="Fill Speed" value={anim.transitionDuration} min={0.5} max={10} step={0.1} onChange={v => setAnim("transitionDuration", v)} />
        </div>
      )}

      {/* Footer */}
      <div style={{ fontSize: 10, color: "#333", textAlign: "center", padding: `${T.xl}px 0 ${T.md}px`, borderTop: "1px solid #1a1a28", marginTop: T.md }}>
        Published by A. Ouyang
      </div>
    </div>
  );
}
