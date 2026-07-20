import React, { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../utils/api";
import { parseLrc, parseAnyLyrics, formatTime, lrcLinesToString, isLrcFormat } from "../utils/lrc";
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
  btnDanger: {
    background: "#3a2020", color: "#e88", border: "none", padding: "8px 16px",
    borderRadius: 6, cursor: "pointer", fontSize: 13, width: "100%", marginBottom: 8,
  } as React.CSSProperties,
  fileLabel: {
    display: "block", background: "#1e1e2e", border: "1px dashed #444",
    borderRadius: 8, padding: "14px", textAlign: "center" as const, cursor: "pointer",
    color: "#888", fontSize: 12, marginBottom: 8,
  } as React.CSSProperties,
  editorArea: { flex: 1, display: "flex", flexDirection: "column" as const, overflow: "hidden" },
  lrcList: { flex: 1, overflowY: "auto" as const, padding: "12px 20px" } as React.CSSProperties,
  audioBar: {
    padding: "12px 24px", background: "#0f0f18", borderTop: "1px solid #222",
    display: "flex", alignItems: "center", gap: 12,
  } as React.CSSProperties,
  playBtn: {
    background: "#6c5ce7", border: "none", color: "#fff", width: 36, height: 36,
    borderRadius: "50%", cursor: "pointer", fontSize: 16, display: "flex",
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  } as React.CSSProperties,
  timeDisplay: { color: "#888", fontSize: 13, fontFamily: "monospace", minWidth: 90 } as React.CSSProperties,
  slider: { flex: 1, accentColor: "#6c5ce7", cursor: "pointer" } as React.CSSProperties,
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
  const [activeTab, setActiveTab] = useState<"editor" | "preview">("editor");
  const [loading, setLoading] = useState("");
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [activeLine, setActiveLine] = useState(-1);
  const [focusLine, setFocusLine] = useState(0); // line cursor for tap-to-stamp
  const [visualConfig, setVisualConfig] = useState<VisualConfig>(defaultVisualConfig);
  const [configDirty, setConfigDirty] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const lrcListRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Load project ---
  const loadProject = useCallback(async () => {
    if (!name) return;
    try {
      const p = await api.getProject(name);
      setProject(p);
      setVisualConfig(mergeConfig(defaultVisualConfig, p.visual_config));
      // Load lyrics: try LRC first, then plain text
      if (p.lrc_file) {
        try {
          const lrc = await api.getLrc(name);
          const parsed = parseLrc(lrc.content);
          if (parsed.length > 0) {
            setLrcLines(parsed);
            return;
          }
        } catch {}
      }
      if (p.lyrics_file) {
        try {
          const txt = await api.getLyricsText(name);
          setLrcLines(parseAnyLyrics(txt.content));
        } catch {}
      }
    } catch (e: any) {
      alert("Failed to load project: " + e.message);
    }
  }, [name]);

  useEffect(() => { loadProject(); }, [loadProject]);

  // --- Audio time tracking ---
  useEffect(() => {
    if (!audioRef.current) return;
    const audio = audioRef.current;
    const onTime = () => {
      setCurrentTime(audio.currentTime);
      // Find active line (only from lines with timestamps set)
      let active = -1;
      for (let i = lrcLines.length - 1; i >= 0; i--) {
        if (lrcLines[i].time >= 0 && audio.currentTime >= lrcLines[i].time) {
          active = i;
          break;
        }
      }
      setActiveLine(active);
    };
    const onEnd = () => setPlaying(false);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnd);
    return () => { audio.removeEventListener("timeupdate", onTime); audio.removeEventListener("ended", onEnd); };
  }, [lrcLines]);

  // --- Keyboard shortcuts for timestamp recording ---
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // Don't capture when typing in an input
      if ((e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      if (activeTab !== "editor") return;

      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.code === "Enter" || e.code === "NumpadEnter") {
        e.preventDefault();
        stampCurrentLine();
      } else if (e.code === "ArrowDown") {
        e.preventDefault();
        setFocusLine((prev) => Math.min(prev + 1, lrcLines.length - 1));
      } else if (e.code === "ArrowUp") {
        e.preventDefault();
        setFocusLine((prev) => Math.max(prev - 1, 0));
      } else if (e.code === "Backspace" && e.metaKey || e.code === "Backspace" && e.ctrlKey) {
        e.preventDefault();
        // Clear timestamp of focused line
        setLrcLines((prev) => {
          const updated = [...prev];
          updated[focusLine] = { ...updated[focusLine], time: -1 };
          return updated;
        });
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  // Auto-scroll to focused line
  useEffect(() => {
    if (activeTab === "editor" && lrcListRef.current && focusLine >= 0) {
      const el = lrcListRef.current.children[focusLine] as HTMLElement;
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [focusLine, activeTab]);

  // --- Helpers ---
  const togglePlay = () => {
    if (!audioRef.current) return;
    if (playing) { audioRef.current.pause(); } else { audioRef.current.play(); }
    setPlaying(!playing);
  };

  const seekTo = (time: number) => {
    if (audioRef.current) { audioRef.current.currentTime = time; setCurrentTime(time); }
  };

  const stampCurrentLine = () => {
    if (!audioRef.current || lrcLines.length === 0) return;
    const t = audioRef.current.currentTime;
    setLrcLines((prev) => {
      const updated = [...prev];
      updated[focusLine] = { ...updated[focusLine], time: parseFloat(t.toFixed(2)) };
      return updated;
    });
    // Auto-advance to next unset line
    setFocusLine((prev) => Math.min(prev + 1, lrcLines.length - 1));
  };

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

  const handleFileUpload = async (type: "audio" | "lyrics" | "cover", file: File) => {
    if (!name) return;
    setLoading(`Uploading ${type}...`);
    try {
      if (type === "audio") {
        await api.uploadAudio(name, file);
      } else if (type === "lyrics") {
        const result = await api.uploadLyrics(name, file);
        // Parse the returned content with smart detection
        const parsed = parseAnyLyrics(result.content);
        setLrcLines(parsed);
        if (result.format === "lrc") {
          setLoading("LRC imported with timestamps");
        } else {
          setLoading("Plain lyrics loaded — use editor to set timestamps");
        }
        setTimeout(() => setLoading(""), 3000);
        await loadProject();
        return;
      } else {
        await api.uploadCover(name, file);
      }
      await loadProject();
    } catch (e: any) { alert(e.message); }
    setLoading("");
  };

  const handleSaveLrc = async () => {
    if (!name) return;
    const content = lrcLinesToString(lrcLines);
    if (!content.trim()) {
      setLoading("No timestamps set yet");
      setTimeout(() => setLoading(""), 2000);
      return;
    }
    try {
      await api.saveLrc(name, content);
      await loadProject();
      setLoading("LRC saved");
      setTimeout(() => setLoading(""), 2000);
    } catch (e: any) { alert(e.message); }
  };

  const handleTimeChange = (index: number, value: string) => {
    if (value === "--:--.--") return;
    const match = value.match(/^(\d{1,2}):(\d{1,2}(?:\.\d*)?)$/);
    if (!match) return;
    const time = parseInt(match[1]) * 60 + parseFloat(match[2]);
    const updated = [...lrcLines];
    updated[index] = { ...updated[index], time };
    setLrcLines(updated);
  };

  const handleRender = async () => {
    if (!name) return;
    // Save everything first
    await api.updateProject(name, { visual_config: visualConfig });
    if (lrcLines.some((l) => l.time >= 0)) {
      await api.saveLrc(name, lrcLinesToString(lrcLines));
    }
    setLoading("Config saved. Run: python render.py " + name);
    setTimeout(() => setLoading(""), 5000);
  };

  const handleClearTimestamps = () => {
    setLrcLines((prev) => prev.map((l) => ({ ...l, time: -1 })));
    setFocusLine(0);
  };

  const stampedCount = lrcLines.filter((l) => l.time >= 0).length;

  if (!project) return <div style={{ padding: 40, color: "#888" }}>Loading...</div>;

  const audioUrl = project.audio_file ? `/static/projects/${name}/audio/${project.audio_file}` : null;
  const coverUrl = project.cover_file ? `/static/projects/${name}/assets/${project.cover_file}` : null;

  return (
    <div style={s.page}>
      {/* Top bar */}
      <div style={s.topBar}>
        <button style={s.backBtn} onClick={() => navigate("/")}>
          &larr; Back
        </button>
        <div style={s.songInfo}>{project.title} - {project.artist}</div>
        <div style={{ fontSize: 12, color: "#888", display: "flex", alignItems: "center", gap: 8 }}>
          {configDirty && <span style={{ color: "#f0ad4e" }}>unsaved</span>}
          {loading && <span style={{ color: "#6c5ce7" }}>{loading}</span>}
        </div>
      </div>

      <div style={s.body}>
        {/* Left sidebar */}
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
            {lrcLines.length > 0 ? (
              <>
                <div style={{ fontSize: 12, color: "#7ec87e", marginBottom: 4 }}>
                  {lrcLines.length} lines loaded
                </div>
                <div style={{ fontSize: 11, color: "#888", marginBottom: 8 }}>
                  {stampedCount}/{lrcLines.length} timestamped
                </div>
              </>
            ) : null}
            <label style={s.fileLabel}>
              Upload lyrics (.txt or .lrc)
              <input type="file" accept=".txt,.lrc" hidden
                onChange={(e) => e.target.files?.[0] && handleFileUpload("lyrics", e.target.files[0])} />
            </label>
            {lrcLines.length > 0 && (
              <>
                <button style={s.btn} onClick={handleSaveLrc}>Save LRC</button>
                <button style={s.btnDanger} onClick={handleClearTimestamps}>
                  Clear All Timestamps
                </button>
              </>
            )}
          </div>

          <div style={s.section}>
            <div style={s.sectionTitle}>Cover Art</div>
            {coverUrl ? (
              <>
                <img src={coverUrl} alt="cover" style={{ width: "100%", borderRadius: 8, marginBottom: 8 }} />
                <label style={{ ...s.fileLabel, padding: "8px" }}>
                  Replace
                  <input type="file" accept="image/*" hidden
                    onChange={(e) => e.target.files?.[0] && handleFileUpload("cover", e.target.files[0])} />
                </label>
              </>
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
            <button style={s.btn} onClick={handleRender}>Export Video</button>
            <button style={s.btnSecondary} onClick={handleSaveLrc}>Save Project</button>
          </div>

          {activeTab === "editor" && (
            <div style={{
              fontSize: 11, color: "#555", lineHeight: 1.6,
              padding: "12px 0", borderTop: "1px solid #1a1a2a",
            }}>
              <div style={{ color: "#888", marginBottom: 4 }}>Shortcuts</div>
              <div><span style={{ color: "#6c5ce7" }}>Space</span> Play / Pause</div>
              <div><span style={{ color: "#6c5ce7" }}>Enter</span> Stamp current line</div>
              <div><span style={{ color: "#6c5ce7" }}>Up/Down</span> Navigate lines</div>
              <div><span style={{ color: "#6c5ce7" }}>Ctrl+Backspace</span> Clear timestamp</div>
              <div><span style={{ color: "#6c5ce7" }}>Click line</span> Stamp + advance</div>
            </div>
          )}
        </div>

        {/* Center: editor / preview */}
        <div style={s.main}>
          <div style={s.tabs}>
            <button
              style={activeTab === "editor" ? s.tabActive : s.tab}
              onClick={() => setActiveTab("editor")}
            >
              Timing Editor
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
                    Upload a lyrics file (.txt or .lrc) to start
                  </div>
                ) : (
                  lrcLines.map((line, i) => {
                    const isFocused = i === focusLine;
                    const isActive = i === activeLine;
                    const hasTime = line.time >= 0;
                    return (
                      <div
                        key={i}
                        style={{
                          display: "flex", alignItems: "center",
                          padding: "8px 12px", borderRadius: 6, marginBottom: 2,
                          cursor: "pointer", transition: "background 0.1s",
                          background: isFocused ? "#1a1a3e" : isActive ? "#161630" : i % 2 === 0 ? "#0e0e16" : "transparent",
                          borderLeft: isFocused ? "3px solid #6c5ce7" : "3px solid transparent",
                        }}
                        onClick={() => {
                          if (playing && audioRef.current) {
                            // Tap to stamp: record current time
                            const t = parseFloat(audioRef.current.currentTime.toFixed(2));
                            setLrcLines((prev) => {
                              const updated = [...prev];
                              updated[i] = { ...updated[i], time: t };
                              return updated;
                            });
                            setFocusLine(Math.min(i + 1, lrcLines.length - 1));
                          } else {
                            // When paused, clicking seeks to that line's time
                            setFocusLine(i);
                            if (hasTime) seekTo(line.time);
                          }
                        }}
                      >
                        {/* Timestamp */}
                        <input
                          style={{
                            width: 80, background: "#0a0a14",
                            border: `1px solid ${hasTime ? "#2a3a2a" : "#3a2a2a"}`,
                            borderRadius: 4,
                            color: hasTime ? "#7ec87e" : "#665",
                            padding: "4px 8px", fontSize: 12, marginRight: 12,
                            fontFamily: "monospace", textAlign: "center" as const, outline: "none",
                          }}
                          value={formatTime(line.time)}
                          onChange={(e) => handleTimeChange(i, e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        {/* Line number */}
                        <span style={{
                          width: 28, fontSize: 11, color: "#444",
                          textAlign: "right" as const, marginRight: 10, flexShrink: 0,
                        }}>
                          {i + 1}
                        </span>
                        {/* Lyric text */}
                        <span style={{
                          color: isFocused ? "#fff" : isActive ? "#ddd" : "#999",
                          fontSize: isFocused ? 15 : 14,
                          fontWeight: isFocused ? 600 : 400,
                          transition: "all 0.15s",
                          flex: 1,
                        }}>
                          {line.text}
                        </span>
                        {/* Status dot */}
                        <span style={{
                          width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                          background: hasTime ? "#4caf50" : "#333",
                        }} />
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            <div style={s.previewContainer}>
              {lrcLines.some((l) => l.time >= 0) ? (
                <LyricVideoPreview
                  project={project}
                  lrcLines={lrcLines.filter((l) => l.time >= 0)}
                  currentTime={currentTime}
                  coverUrl={coverUrl}
                  visualConfig={visualConfig}
                />
              ) : (
                <div style={{ color: "#555", textAlign: "center" }}>
                  <div style={{ marginBottom: 8 }}>No timestamps set yet</div>
                  <div style={{ fontSize: 12 }}>Switch to Timing Editor and record timestamps</div>
                </div>
              )}
            </div>
          )}

          {/* Audio player bar */}
          {audioUrl && (
            <div style={s.audioBar}>
              <audio ref={audioRef} src={audioUrl} preload="auto" />
              <button style={s.playBtn} onClick={togglePlay}>
                {playing ? "\u275A\u275A" : "\u25B6"}
              </button>
              <span style={s.timeDisplay}>{formatTime(currentTime)}</span>
              <input
                type="range" min={0} max={project.duration || 100} step={0.01}
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
