import React, { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../utils/api";
import { parseLrc, formatTime, lrcLinesToString } from "../utils/lrc";
import { defaultVisualConfig, mergeConfig } from "../utils/visualDefaults";
import type { Project, LrcLine, VisualConfig } from "../types";
import LyricVideoPreview from "../components/LyricVideoPreview";
import VisualEditor from "../components/VisualEditor";

const s = {
  page: { display: "flex", flexDirection: "column" as const, minHeight: "100vh" },
  topBar: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "12px 24px", background: "#12121a", borderBottom: "1px solid #222",
  } as React.CSSProperties,
  backBtn: {
    background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: 14,
  } as React.CSSProperties,
  songInfo: { color: "#fff", fontWeight: 600, fontSize: 16 } as React.CSSProperties,
  body: { display: "flex", flex: 1, overflow: "hidden" } as React.CSSProperties,
  sidebar: {
    width: 280, background: "#12121a", borderRight: "1px solid #222",
    padding: 20, overflowY: "auto" as const, flexShrink: 0,
  } as React.CSSProperties,
  rightPanel: {
    width: 320, background: "#12121a", borderLeft: "1px solid #222",
    flexShrink: 0, display: "flex", flexDirection: "column" as const,
  } as React.CSSProperties,
  main: { flex: 1, display: "flex", flexDirection: "column" as const, overflow: "hidden" },
  section: { marginBottom: 20 } as React.CSSProperties,
  sectionTitle: {
    fontSize: 11, color: "#888", textTransform: "uppercase" as const,
    marginBottom: 8, letterSpacing: 1,
  },
  btn: {
    background: "#6c5ce7", color: "#fff", border: "none", padding: "8px 16px",
    borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 500, width: "100%", marginBottom: 8,
  } as React.CSSProperties,
  btnSecondary: {
    background: "#2a2a3a", color: "#ccc", border: "none", padding: "8px 16px",
    borderRadius: 6, cursor: "pointer", fontSize: 13, width: "100%", marginBottom: 8,
  } as React.CSSProperties,
  fileLabel: {
    display: "block", background: "#1e1e2e", border: "1px dashed #444",
    borderRadius: 8, padding: "14px", textAlign: "center" as const, cursor: "pointer",
    color: "#888", fontSize: 12, marginBottom: 8,
  } as React.CSSProperties,
  editorArea: { flex: 1, display: "flex", flexDirection: "column" as const, overflow: "hidden" },
  lrcList: { flex: 1, overflowY: "auto" as const, padding: "16px 24px" } as React.CSSProperties,
  lrcRow: {
    display: "flex", alignItems: "center", padding: "8px 12px", borderRadius: 6,
    marginBottom: 4, cursor: "pointer", transition: "background 0.15s",
  } as React.CSSProperties,
  timeInput: {
    width: 80, background: "#0a0a14", border: "1px solid #333", borderRadius: 4,
    color: "#6c5ce7", padding: "4px 8px", fontSize: 13, marginRight: 12,
    fontFamily: "monospace", textAlign: "center" as const, outline: "none",
  } as React.CSSProperties,
  audioBar: {
    padding: "12px 24px", background: "#0f0f18", borderTop: "1px solid #222",
    display: "flex", alignItems: "center", gap: 12,
  } as React.CSSProperties,
  playBtn: {
    background: "#6c5ce7", border: "none", color: "#fff", width: 36, height: 36,
    borderRadius: "50%", cursor: "pointer", fontSize: 16, display: "flex",
    alignItems: "center", justifyContent: "center",
  } as React.CSSProperties,
  timeDisplay: { color: "#888", fontSize: 13, fontFamily: "monospace", minWidth: 100 } as React.CSSProperties,
  slider: { flex: 1, accentColor: "#6c5ce7" } as React.CSSProperties,
  previewContainer: {
    flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
    background: "#000", padding: 20, overflow: "hidden",
  } as React.CSSProperties,
  tabs: { display: "flex", borderBottom: "1px solid #222", background: "#12121a" } as React.CSSProperties,
  tab: {
    padding: "12px 24px", cursor: "pointer", fontSize: 13, fontWeight: 500,
    border: "none", background: "none", color: "#888",
  } as React.CSSProperties,
  tabActive: {
    padding: "12px 24px", cursor: "pointer", fontSize: 13, fontWeight: 500,
    border: "none", background: "none", color: "#fff",
    borderBottom: "2px solid #6c5ce7",
  } as React.CSSProperties,
};

export default function ProjectEditor() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [lrcLines, setLrcLines] = useState<LrcLine[]>([]);
  const [activeTab, setActiveTab] = useState<"editor" | "preview">("preview");
  const [loading, setLoading] = useState("");
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [activeLine, setActiveLine] = useState(-1);
  const [visualConfig, setVisualConfig] = useState<VisualConfig>(defaultVisualConfig);
  const [configDirty, setConfigDirty] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const lrcListRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadProject = useCallback(async () => {
    if (!name) return;
    try {
      const p = await api.getProject(name);
      setProject(p);
      setVisualConfig(mergeConfig(defaultVisualConfig, p.visual_config));
      if (p.lrc_file) {
        const lrc = await api.getLrc(name);
        setLrcLines(parseLrc(lrc.content));
      }
    } catch (e: any) {
      alert("Failed to load project: " + e.message);
    }
  }, [name]);

  useEffect(() => { loadProject(); }, [loadProject]);

  useEffect(() => {
    if (!audioRef.current) return;
    const audio = audioRef.current;
    const onTime = () => {
      setCurrentTime(audio.currentTime);
      let active = -1;
      for (let i = lrcLines.length - 1; i >= 0; i--) {
        if (audio.currentTime >= lrcLines[i].time) { active = i; break; }
      }
      setActiveLine(active);
    };
    const onEnd = () => setPlaying(false);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnd);
    return () => { audio.removeEventListener("timeupdate", onTime); audio.removeEventListener("ended", onEnd); };
  }, [lrcLines]);

  // Auto-scroll lyric editor to active line
  useEffect(() => {
    if (activeTab === "editor" && activeLine >= 0 && lrcListRef.current) {
      const el = lrcListRef.current.children[activeLine] as HTMLElement;
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeLine, activeTab]);

  // Debounced auto-save of visual config
  const handleVisualConfigChange = (cfg: VisualConfig) => {
    setVisualConfig(cfg);
    setConfigDirty(true);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (name) {
        api.updateProject(name, { visual_config: cfg }).catch(() => {});
        setConfigDirty(false);
      }
    }, 800);
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); } else { audioRef.current.play(); }
    setPlaying(!playing);
  };

  const seekTo = (time: number) => {
    if (audioRef.current) { audioRef.current.currentTime = time; setCurrentTime(time); }
  };

  const handleFileUpload = async (type: "audio" | "lyrics" | "cover", file: File) => {
    if (!name) return;
    setLoading(`Uploading ${type}...`);
    try {
      if (type === "audio") await api.uploadAudio(name, file);
      else if (type === "lyrics") await api.uploadLyrics(name, file);
      else await api.uploadCover(name, file);
      await loadProject();
    } catch (e: any) { alert(e.message); }
    setLoading("");
  };

  const handleAlign = async () => {
    if (!name) return;
    setLoading("Aligning lyrics...");
    try {
      const result = await api.alignLyrics(name);
      setLrcLines(parseLrc(result.lrc_content));
      await loadProject();
      setLoading(`Aligned using: ${result.method}`);
      setTimeout(() => setLoading(""), 3000);
    } catch (e: any) { alert(e.message); setLoading(""); }
  };

  const handleSaveLrc = async () => {
    if (!name) return;
    const content = lrcLinesToString(lrcLines);
    try {
      await api.saveLrc(name, content);
      setLoading("LRC saved");
      setTimeout(() => setLoading(""), 2000);
    } catch (e: any) { alert(e.message); }
  };

  const handleTimeChange = (index: number, value: string) => {
    const match = value.match(/^(\d{1,2}):(\d{1,2}(?:\.\d*)?)$/);
    if (!match) return;
    const time = parseInt(match[1]) * 60 + parseFloat(match[2]);
    const updated = [...lrcLines];
    updated[index] = { ...updated[index], time };
    setLrcLines(updated);
  };

  const handleRender = async () => {
    if (!name) return;
    // Save config before render
    await api.updateProject(name, { visual_config: visualConfig });
    setLoading("Config saved. Run: python3 render.py " + name);
    setTimeout(() => setLoading(""), 5000);
  };

  if (!project) return <div style={{ padding: 40, color: "#888" }}>Loading...</div>;

  const audioUrl = project.audio_file ? `/static/projects/${name}/audio/${project.audio_file}` : null;
  const coverUrl = project.cover_file ? `/static/projects/${name}/assets/${project.cover_file}` : null;

  return (
    <div style={s.page}>
      <div style={s.topBar}>
        <button style={s.backBtn} onClick={() => navigate("/")}>
          &larr; Back
        </button>
        <div style={s.songInfo}>
          {project.title} - {project.artist}
        </div>
        <div style={{ fontSize: 12, color: "#888", display: "flex", alignItems: "center", gap: 8 }}>
          {configDirty && <span style={{ color: "#f0ad4e" }}>unsaved</span>}
          {loading && <span style={{ color: "#6c5ce7" }}>{loading}</span>}
        </div>
      </div>

      <div style={s.body}>
        {/* Left sidebar: files & actions */}
        <div style={s.sidebar}>
          <div style={s.section}>
            <div style={s.sectionTitle}>Audio</div>
            {project.audio_file ? (
              <div style={{ fontSize: 12, color: "#7ec87e", marginBottom: 8 }}>
                {project.audio_file} ({project.duration?.toFixed(1)}s)
              </div>
            ) : (
              <label style={s.fileLabel}>
                Upload audio
                <input type="file" accept="audio/*" hidden
                  onChange={(e) => e.target.files?.[0] && handleFileUpload("audio", e.target.files[0])} />
              </label>
            )}
          </div>

          <div style={s.section}>
            <div style={s.sectionTitle}>Lyrics</div>
            {project.lyrics_file ? (
              <div style={{ fontSize: 12, color: "#7ec87e", marginBottom: 8 }}>lyrics.txt loaded</div>
            ) : (
              <label style={s.fileLabel}>
                Upload lyrics .txt
                <input type="file" accept=".txt" hidden
                  onChange={(e) => e.target.files?.[0] && handleFileUpload("lyrics", e.target.files[0])} />
              </label>
            )}
            {project.lyrics_file && project.audio_file && (
              <button style={s.btn} onClick={handleAlign}>Generate Timestamps</button>
            )}
            {lrcLines.length > 0 && (
              <button style={s.btnSecondary} onClick={handleSaveLrc}>Save LRC</button>
            )}
          </div>

          <div style={s.section}>
            <div style={s.sectionTitle}>Cover Art</div>
            {coverUrl ? (
              <img src={coverUrl} alt="cover" style={{ width: "100%", borderRadius: 8, marginBottom: 8 }} />
            ) : (
              <label style={s.fileLabel}>
                Upload cover image
                <input type="file" accept="image/*" hidden
                  onChange={(e) => e.target.files?.[0] && handleFileUpload("cover", e.target.files[0])} />
              </label>
            )}
          </div>

          <div style={s.section}>
            <div style={s.sectionTitle}>Export</div>
            <button style={s.btn} onClick={handleRender}>Render MP4</button>
          </div>
        </div>

        {/* Center: preview / editor */}
        <div style={s.main}>
          <div style={s.tabs}>
            <button
              style={activeTab === "editor" ? s.tabActive : s.tab}
              onClick={() => setActiveTab("editor")}
            >
              Lyric Editor
            </button>
            <button
              style={activeTab === "preview" ? s.tabActive : s.tab}
              onClick={() => setActiveTab("preview")}
            >
              Video Preview
            </button>
          </div>

          {activeTab === "editor" ? (
            <div style={s.editorArea}>
              <div style={s.lrcList} ref={lrcListRef}>
                {lrcLines.length === 0 ? (
                  <div style={{ color: "#555", textAlign: "center", padding: 40 }}>
                    Upload lyrics and generate timestamps to start editing
                  </div>
                ) : (
                  lrcLines.map((line, i) => (
                    <div
                      key={i}
                      style={{
                        ...s.lrcRow,
                        background: i === activeLine ? "#1a1a3e" : i % 2 === 0 ? "#0e0e16" : "transparent",
                      }}
                      onClick={() => seekTo(line.time)}
                    >
                      <input
                        style={s.timeInput}
                        value={formatTime(line.time)}
                        onChange={(e) => handleTimeChange(i, e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <span style={{
                        color: i === activeLine ? "#fff" : "#aaa",
                        fontSize: i === activeLine ? 16 : 14,
                        fontWeight: i === activeLine ? 600 : 400,
                        transition: "all 0.2s",
                      }}>
                        {line.text}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div style={s.previewContainer}>
              {project.audio_file && lrcLines.length > 0 ? (
                <LyricVideoPreview
                  project={project}
                  lrcLines={lrcLines}
                  currentTime={currentTime}
                  coverUrl={coverUrl}
                  visualConfig={visualConfig}
                />
              ) : (
                <div style={{ color: "#555" }}>
                  Upload audio, lyrics, and generate timestamps to preview
                </div>
              )}
            </div>
          )}

          {/* Audio player bar */}
          {audioUrl && (
            <div style={s.audioBar}>
              <audio ref={audioRef} src={audioUrl} preload="auto" />
              <button style={s.playBtn} onClick={togglePlay}>
                {playing ? "||" : "\u25B6"}
              </button>
              <span style={s.timeDisplay}>{formatTime(currentTime)}</span>
              <input
                type="range" min={0} max={project.duration || 100} step={0.1}
                value={currentTime}
                onChange={(e) => seekTo(parseFloat(e.target.value))}
                style={s.slider}
              />
              <span style={s.timeDisplay}>{formatTime(project.duration || 0)}</span>
            </div>
          )}
        </div>

        {/* Right panel: visual editor */}
        <div style={s.rightPanel}>
          <div style={{
            padding: "12px 20px", borderBottom: "1px solid #222",
            fontSize: 12, color: "#888", textTransform: "uppercase", letterSpacing: 1,
          }}>
            Visual Settings
          </div>
          <div style={{ flex: 1, overflow: "hidden" }}>
            <VisualEditor config={visualConfig} onChange={handleVisualConfigChange} />
          </div>
        </div>
      </div>
    </div>
  );
}
