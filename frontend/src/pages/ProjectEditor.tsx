import React, { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../utils/api";
import { parseLrc, parseAnyLyrics, formatTime, lrcLinesToString } from "../utils/lrc";
import { defaultVisualConfig, mergeConfig } from "../utils/visualDefaults";
import type { Project, LrcLine, VisualConfig } from "../types";
import LyricVideoPreview from "../components/LyricVideoPreview";
import VisualEditor from "../components/VisualEditor";

/* ------------------------------------------------------------------ */
/*  Toast type                                                         */
/* ------------------------------------------------------------------ */
interface Toast {
  id: number;
  message: string;
  type: "info" | "success" | "error";
  ttl: number;
}

let nextToastId = 0;

/* ------------------------------------------------------------------ */
/*  Inline styles (dark theme, #0a0a0f family)                         */
/* ------------------------------------------------------------------ */
const s = {
  page: {
    display: "flex",
    flexDirection: "column" as const,
    minHeight: "100vh",
    background: "#0a0a0f",
    color: "#ccc",
  } as React.CSSProperties,

  topBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 24px",
    background: "#12121a",
    borderBottom: "1px solid #1e1e2a",
    zIndex: 10,
  } as React.CSSProperties,

  backBtn: {
    background: "none",
    border: "none",
    color: "#888",
    cursor: "pointer",
    fontSize: 14,
    display: "flex",
    alignItems: "center",
    gap: 6,
    transition: "color 0.15s",
  } as React.CSSProperties,

  songInfo: {
    color: "#fff",
    fontWeight: 600,
    fontSize: 16,
    letterSpacing: 0.3,
  } as React.CSSProperties,

  body: {
    display: "flex",
    flex: 1,
    overflow: "hidden",
  } as React.CSSProperties,

  sidebar: {
    width: 280,
    background: "#12121a",
    borderRight: "1px solid #1e1e2a",
    padding: 20,
    overflowY: "auto" as const,
    flexShrink: 0,
  } as React.CSSProperties,

  rightPanel: {
    width: 320,
    background: "#12121a",
    borderLeft: "1px solid #1e1e2a",
    flexShrink: 0,
    display: "flex",
    flexDirection: "column" as const,
  } as React.CSSProperties,

  main: {
    flex: 1,
    display: "flex",
    flexDirection: "column" as const,
    overflow: "hidden",
    background: "#0a0a0f",
  } as React.CSSProperties,

  section: {
    marginBottom: 20,
  } as React.CSSProperties,

  sectionTitle: {
    fontSize: 11,
    color: "#666",
    textTransform: "uppercase" as const,
    marginBottom: 8,
    letterSpacing: 1.2,
    fontWeight: 600,
  } as React.CSSProperties,

  btn: {
    background: "#6c5ce7",
    color: "#fff",
    border: "none",
    padding: "8px 16px",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 500,
    width: "100%",
    marginBottom: 8,
    transition: "background 0.15s, transform 0.1s",
  } as React.CSSProperties,

  btnSecondary: {
    background: "#1e1e2e",
    color: "#bbb",
    border: "1px solid #2a2a3a",
    padding: "8px 16px",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 13,
    width: "100%",
    marginBottom: 8,
    transition: "background 0.15s",
  } as React.CSSProperties,

  btnDanger: {
    background: "#2a1515",
    color: "#e88",
    border: "1px solid #3a2020",
    padding: "8px 16px",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 13,
    width: "100%",
    marginBottom: 8,
    transition: "background 0.15s",
  } as React.CSSProperties,

  fileLabel: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    background: "#0e0e18",
    border: "1px dashed #333",
    borderRadius: 8,
    padding: "18px 14px",
    textAlign: "center" as const,
    cursor: "pointer",
    color: "#666",
    fontSize: 12,
    marginBottom: 8,
    transition: "border-color 0.2s, background 0.2s",
    gap: 6,
  } as React.CSSProperties,

  editorArea: {
    flex: 1,
    display: "flex",
    flexDirection: "column" as const,
    overflow: "hidden",
  } as React.CSSProperties,

  lrcList: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "12px 20px",
  } as React.CSSProperties,

  audioBar: {
    padding: "12px 24px",
    background: "#0c0c14",
    borderTop: "1px solid #1e1e2a",
    display: "flex",
    alignItems: "center",
    gap: 12,
  } as React.CSSProperties,

  playBtn: {
    background: "#6c5ce7",
    border: "none",
    color: "#fff",
    width: 36,
    height: 36,
    borderRadius: "50%",
    cursor: "pointer",
    fontSize: 16,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    transition: "background 0.15s, transform 0.1s",
  } as React.CSSProperties,

  timeDisplay: {
    color: "#888",
    fontSize: 13,
    fontFamily: "monospace",
    minWidth: 90,
  } as React.CSSProperties,

  slider: {
    flex: 1,
    accentColor: "#6c5ce7",
    cursor: "pointer",
  } as React.CSSProperties,

  previewContainer: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#000",
    padding: 20,
    overflow: "hidden",
  } as React.CSSProperties,

  tabs: {
    display: "flex",
    borderBottom: "1px solid #1e1e2a",
    background: "#12121a",
  } as React.CSSProperties,

  tab: {
    padding: "12px 24px",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 500,
    border: "none",
    background: "none",
    color: "#666",
    transition: "color 0.2s",
    borderBottom: "2px solid transparent",
  } as React.CSSProperties,

  tabActive: {
    padding: "12px 24px",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 500,
    border: "none",
    background: "none",
    color: "#fff",
    borderBottom: "2px solid #6c5ce7",
    transition: "color 0.2s",
  } as React.CSSProperties,
};

/* ------------------------------------------------------------------ */
/*  SVG icons (inline)                                                 */
/* ------------------------------------------------------------------ */
const IconUpload = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const IconMusic = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7ec87e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
);

const IconLyrics = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7ec87e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="4" y1="6" x2="20" y2="6" />
    <line x1="4" y1="10" x2="16" y2="10" />
    <line x1="4" y1="14" x2="18" y2="14" />
    <line x1="4" y1="18" x2="12" y2="18" />
  </svg>
);

const IconImage = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
);

const IconEmpty = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);

const IconVideoOff = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="16" height="16" rx="2" />
    <path d="M22 7l-4 3 4 3V7z" />
    <line x1="8" y1="10" x2="12" y2="14" />
    <line x1="12" y1="10" x2="8" y2="14" />
  </svg>
);

const SpinnerSvg = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" style={{ animation: "spin 0.8s linear infinite" }}>
    <circle cx="12" cy="12" r="10" stroke="#6c5ce7" strokeWidth="3" strokeDasharray="32" strokeLinecap="round" />
  </svg>
);

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
export default function ProjectEditor() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();

  /* ---------- Core state ---------- */
  const [project, setProject] = useState<Project | null>(null);
  const [lrcLines, setLrcLines] = useState<LrcLine[]>([]);
  const [activeTab, setActiveTab] = useState<"editor" | "preview">("editor");
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [activeLine, setActiveLine] = useState(-1);
  const [focusLine, setFocusLine] = useState(0);
  const [visualConfig, setVisualConfig] = useState<VisualConfig>(defaultVisualConfig);
  const [configDirty, setConfigDirty] = useState(false);
  const [uploading, setUploading] = useState(false);

  /* ---------- Toast state ---------- */
  const [toasts, setToasts] = useState<Toast[]>([]);

  /* ---------- Refs ---------- */
  const audioRef = useRef<HTMLAudioElement>(null);
  const lrcListRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekingRef = useRef(false);
  const wasPlayingRef = useRef(false);

  /* ---------------------------------------------------------------- */
  /*  Toast helpers                                                    */
  /* ---------------------------------------------------------------- */
  const addToast = useCallback(
    (message: string, type: "info" | "success" | "error" = "info", ttl: number = 3000) => {
      const id = ++nextToastId;
      setToasts((prev) => [...prev, { id, message, type, ttl }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, ttl);
    },
    [],
  );

  /* ---------------------------------------------------------------- */
  /*  Load project                                                     */
  /* ---------------------------------------------------------------- */
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
        } catch {
          /* ignore */
        }
      }
      if (p.lyrics_file) {
        try {
          const txt = await api.getLyricsText(name);
          setLrcLines(parseAnyLyrics(txt.content));
        } catch {
          /* ignore */
        }
      }
    } catch (e: any) {
      addToast("Failed to load project: " + e.message, "error", 5000);
    }
  }, [name, addToast]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  /* ---------------------------------------------------------------- */
  /*  Audio time tracking (respects seeking ref)                       */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    if (!audioRef.current) return;
    const audio = audioRef.current;

    const onTime = () => {
      if (seekingRef.current) return; // do NOT fight the slider
      setCurrentTime(audio.currentTime);

      // Find active line (only lines with timestamps set)
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
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnd);
    };
  }, [lrcLines]);

  /* ---------------------------------------------------------------- */
  /*  Keyboard shortcuts for timestamp recording                       */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
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
      } else if (e.code === "Backspace" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
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

  /* ---------------------------------------------------------------- */
  /*  Auto-scroll to focused line                                      */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    if (activeTab === "editor" && lrcListRef.current && focusLine >= 0) {
      const el = lrcListRef.current.children[focusLine] as HTMLElement;
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [focusLine, activeTab]);

  /* ---------------------------------------------------------------- */
  /*  Player helpers                                                   */
  /* ---------------------------------------------------------------- */
  const togglePlay = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setPlaying(!playing);
  };

  const seekTo = (time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  /* --- Timeline slider seeking (fix for drag-while-playing) --- */
  const handleSliderPointerDown = () => {
    seekingRef.current = true;
    wasPlayingRef.current = playing;
    if (audioRef.current && playing) {
      audioRef.current.pause();
    }
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setCurrentTime(val);
    if (audioRef.current) {
      audioRef.current.currentTime = val;
    }
  };

  const handleSliderPointerUp = () => {
    seekingRef.current = false;
    if (wasPlayingRef.current && audioRef.current) {
      audioRef.current.play();
      setPlaying(true);
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Stamp helpers                                                    */
  /* ---------------------------------------------------------------- */
  const stampCurrentLine = () => {
    if (!audioRef.current || lrcLines.length === 0) return;
    const t = audioRef.current.currentTime;
    setLrcLines((prev) => {
      const updated = [...prev];
      updated[focusLine] = { ...updated[focusLine], time: parseFloat(t.toFixed(2)) };
      return updated;
    });
    setFocusLine((prev) => Math.min(prev + 1, lrcLines.length - 1));
  };

  /* ---------------------------------------------------------------- */
  /*  Visual config                                                    */
  /* ---------------------------------------------------------------- */
  const handleVisualConfigChange = (cfg: VisualConfig) => {
    setVisualConfig(cfg);
    setConfigDirty(true);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      if (name) {
        api
          .updateProject(name, { visual_config: cfg })
          .then(() => {
            setConfigDirty(false);
          })
          .catch(() => {
            addToast("Failed to save visual config", "error");
          });
      }
    }, 800);
  };

  /* ---------------------------------------------------------------- */
  /*  File uploads (with spinner overlay)                               */
  /* ---------------------------------------------------------------- */
  const handleFileUpload = async (type: "audio" | "lyrics" | "cover", file: File) => {
    if (!name) return;
    setUploading(true);
    try {
      if (type === "audio") {
        await api.uploadAudio(name, file);
        addToast("Audio uploaded successfully", "success");
      } else if (type === "lyrics") {
        const result = await api.uploadLyrics(name, file);
        const parsed = parseAnyLyrics(result.content);
        setLrcLines(parsed);
        if (result.format === "lrc") {
          addToast("LRC imported with timestamps", "success");
        } else {
          addToast("Plain lyrics loaded -- use editor to set timestamps", "info", 4000);
        }
        setUploading(false);
        await loadProject();
        return;
      } else {
        await api.uploadCover(name, file);
        addToast("Cover art uploaded", "success");
      }
      await loadProject();
    } catch (e: any) {
      addToast(e.message || "Upload failed", "error", 5000);
    }
    setUploading(false);
  };

  /* ---------------------------------------------------------------- */
  /*  Save / export                                                    */
  /* ---------------------------------------------------------------- */
  const handleSaveLrc = async () => {
    if (!name) return;
    const content = lrcLinesToString(lrcLines);
    if (!content.trim()) {
      addToast("No timestamps set yet", "info");
      return;
    }
    try {
      await api.saveLrc(name, content);
      await loadProject();
      addToast("LRC saved successfully", "success");
    } catch (e: any) {
      addToast(e.message || "Failed to save LRC", "error");
    }
  };

  const handleRender = async () => {
    if (!name) return;
    try {
      await api.updateProject(name, { visual_config: visualConfig });
      if (lrcLines.some((l) => l.time >= 0)) {
        await api.saveLrc(name, lrcLinesToString(lrcLines));
      }
      addToast("Config saved. Run: python render.py " + name, "success", 6000);
    } catch (e: any) {
      addToast(e.message || "Failed to export", "error");
    }
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

  const handleClearTimestamps = () => {
    setLrcLines((prev) => prev.map((l) => ({ ...l, time: -1 })));
    setFocusLine(0);
    addToast("All timestamps cleared", "info");
  };

  /* ---------------------------------------------------------------- */
  /*  Derived values                                                   */
  /* ---------------------------------------------------------------- */
  const stampedCount = lrcLines.filter((l) => l.time >= 0).length;
  const filteredLines = lrcLines.filter((l) => l.time >= 0);

  /* ---------------------------------------------------------------- */
  /*  Loading screen                                                   */
  /* ---------------------------------------------------------------- */
  if (!project) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          background: "#0a0a0f",
          color: "#666",
          gap: 16,
        }}
      >
        <SpinnerSvg />
        <span style={{ fontSize: 14 }}>Loading project...</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const audioUrl = project.audio_file ? `/static/projects/${name}/audio/${project.audio_file}` : null;
  const coverUrl = project.cover_file ? `/static/projects/${name}/assets/${project.cover_file}` : null;

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */
  return (
    <div style={s.page}>
      {/* Global keyframes */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes toastIn {
          from { opacity: 0; transform: translateX(60px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes toastOut {
          from { opacity: 1; }
          to   { opacity: 0; transform: translateX(60px); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>

      {/* ==================== TOAST NOTIFICATIONS ==================== */}
      <div
        style={{
          position: "fixed",
          top: 16,
          right: 16,
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          pointerEvents: "none",
        }}
      >
        {toasts.map((toast) => {
          const bg =
            toast.type === "success"
              ? "linear-gradient(135deg, #1a3a1a, #1e2e1e)"
              : toast.type === "error"
                ? "linear-gradient(135deg, #3a1a1a, #2e1e1e)"
                : "linear-gradient(135deg, #1a1a3a, #1e1e2e)";
          const borderColor =
            toast.type === "success"
              ? "#2a5a2a"
              : toast.type === "error"
                ? "#5a2a2a"
                : "#2a2a5a";
          const textColor =
            toast.type === "success"
              ? "#8fdf8f"
              : toast.type === "error"
                ? "#f08080"
                : "#8f8fdf";
          const icon =
            toast.type === "success"
              ? "\u2713"
              : toast.type === "error"
                ? "\u2717"
                : "\u2139";
          return (
            <div
              key={toast.id}
              style={{
                background: bg,
                border: `1px solid ${borderColor}`,
                borderRadius: 10,
                padding: "10px 18px",
                color: textColor,
                fontSize: 13,
                fontWeight: 500,
                maxWidth: 360,
                boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                animation: "toastIn 0.3s ease-out",
                pointerEvents: "auto",
                display: "flex",
                alignItems: "center",
                gap: 10,
                backdropFilter: "blur(12px)",
              }}
            >
              <span style={{ fontSize: 16, lineHeight: 1 }}>{icon}</span>
              <span>{toast.message}</span>
            </div>
          );
        })}
      </div>

      {/* ==================== UPLOAD SPINNER OVERLAY ==================== */}
      {uploading && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9000,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            backdropFilter: "blur(4px)",
            animation: "fadeIn 0.2s ease-out",
          }}
        >
          <SpinnerSvg />
          <span style={{ color: "#aaa", fontSize: 14, fontWeight: 500 }}>Uploading...</span>
        </div>
      )}

      {/* ==================== TOP BAR ==================== */}
      <div style={s.topBar}>
        <button
          style={s.backBtn}
          onClick={() => navigate("/")}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "#ccc")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "#888")}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          Back
        </button>
        <div style={s.songInfo}>
          {project.title} - {project.artist}
        </div>
        <div style={{ fontSize: 12, color: "#888", display: "flex", alignItems: "center", gap: 8 }}>
          {configDirty && (
            <span
              style={{
                color: "#f0ad4e",
                fontSize: 11,
                background: "#2a2510",
                padding: "2px 8px",
                borderRadius: 4,
                border: "1px solid #4a3a10",
              }}
            >
              unsaved
            </span>
          )}
        </div>
      </div>

      <div style={s.body}>
        {/* ==================== LEFT SIDEBAR ==================== */}
        <div style={s.sidebar}>
          {/* --- Audio --- */}
          <div style={s.section}>
            <div style={s.sectionTitle}>Audio</div>
            {project.audio_file ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 12,
                  color: "#7ec87e",
                  marginBottom: 8,
                  background: "#0e1a0e",
                  padding: "8px 12px",
                  borderRadius: 6,
                  border: "1px solid #1a2a1a",
                }}
              >
                <IconMusic />
                <div>
                  <div style={{ fontWeight: 500 }}>{project.audio_file}</div>
                  {project.duration != null && (
                    <div style={{ color: "#5a8a5a", fontSize: 11, marginTop: 2 }}>
                      {project.duration.toFixed(1)}s
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <label style={s.fileLabel}>
                <IconUpload />
                <span>Drop or click to upload audio</span>
                <span style={{ fontSize: 10, color: "#444" }}>MP3, WAV, FLAC</span>
                <input
                  type="file"
                  accept="audio/*"
                  hidden
                  onChange={(e) => e.target.files?.[0] && handleFileUpload("audio", e.target.files[0])}
                />
              </label>
            )}
          </div>

          {/* --- Lyrics --- */}
          <div style={s.section}>
            <div style={s.sectionTitle}>Lyrics</div>
            {lrcLines.length > 0 ? (
              <div
                style={{
                  background: "#0e1a0e",
                  padding: "8px 12px",
                  borderRadius: 6,
                  border: "1px solid #1a2a1a",
                  marginBottom: 8,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#7ec87e" }}>
                  <IconLyrics />
                  <span style={{ fontWeight: 500 }}>{lrcLines.length} lines loaded</span>
                </div>
                <div style={{ fontSize: 11, color: "#5a8a5a", marginTop: 4, marginLeft: 24 }}>
                  {stampedCount}/{lrcLines.length} timestamped
                </div>
                {/* Progress bar */}
                <div
                  style={{
                    height: 3,
                    background: "#1a2a1a",
                    borderRadius: 2,
                    marginTop: 6,
                    marginLeft: 24,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${lrcLines.length > 0 ? (stampedCount / lrcLines.length) * 100 : 0}%`,
                      background: "#4caf50",
                      borderRadius: 2,
                      transition: "width 0.3s",
                    }}
                  />
                </div>
              </div>
            ) : null}
            <label style={s.fileLabel}>
              <IconUpload />
              <span>Upload lyrics (.txt or .lrc)</span>
              <input
                type="file"
                accept=".txt,.lrc"
                hidden
                onChange={(e) => e.target.files?.[0] && handleFileUpload("lyrics", e.target.files[0])}
              />
            </label>
            {lrcLines.length > 0 && (
              <>
                <button style={s.btn} onClick={handleSaveLrc}>
                  Save LRC
                </button>
                <button style={s.btnDanger} onClick={handleClearTimestamps}>
                  Clear All Timestamps
                </button>
              </>
            )}
          </div>

          {/* --- Cover Art --- */}
          <div style={s.section}>
            <div style={s.sectionTitle}>Cover Art</div>
            {coverUrl ? (
              <>
                <img
                  src={coverUrl}
                  alt="cover"
                  style={{
                    width: "100%",
                    borderRadius: 8,
                    marginBottom: 8,
                    boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
                  }}
                />
                <label style={{ ...s.fileLabel, padding: "8px" }}>
                  <span>Replace cover</span>
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => e.target.files?.[0] && handleFileUpload("cover", e.target.files[0])}
                  />
                </label>
              </>
            ) : (
              <label style={s.fileLabel}>
                <IconImage />
                <span>Upload cover image</span>
                <span style={{ fontSize: 10, color: "#444" }}>PNG, JPG, WEBP</span>
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => e.target.files?.[0] && handleFileUpload("cover", e.target.files[0])}
                />
              </label>
            )}
          </div>

          {/* --- Export --- */}
          <div style={s.section}>
            <div style={s.sectionTitle}>Export</div>
            <button style={s.btn} onClick={handleRender}>
              Export Video
            </button>
            <button style={s.btnSecondary} onClick={handleSaveLrc}>
              Save Project
            </button>
          </div>

          {/* --- Shortcuts hint (editor tab only) --- */}
          {activeTab === "editor" && (
            <div
              style={{
                fontSize: 11,
                color: "#444",
                lineHeight: 1.7,
                padding: "12px 0",
                borderTop: "1px solid #1a1a2a",
              }}
            >
              <div style={{ color: "#666", marginBottom: 6, fontWeight: 600, letterSpacing: 0.5 }}>Shortcuts</div>
              <div>
                <span style={{ color: "#6c5ce7", fontFamily: "monospace" }}>Space</span> Play / Pause
              </div>
              <div>
                <span style={{ color: "#6c5ce7", fontFamily: "monospace" }}>Enter</span> Stamp current line
              </div>
              <div>
                <span style={{ color: "#6c5ce7", fontFamily: "monospace" }}>Up/Down</span> Navigate lines
              </div>
              <div>
                <span style={{ color: "#6c5ce7", fontFamily: "monospace" }}>Ctrl+Bksp</span> Clear timestamp
              </div>
              <div>
                <span style={{ color: "#6c5ce7", fontFamily: "monospace" }}>Click</span> Stamp + advance
              </div>
            </div>
          )}
        </div>

        {/* ==================== CENTER: EDITOR / PREVIEW ==================== */}
        <div style={s.main}>
          {/* Tabs */}
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

          {/* Tab content with transition wrapper */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
            {/* --- EDITOR TAB --- */}
            <div
              style={{
                ...s.editorArea,
                position: "absolute",
                inset: 0,
                opacity: activeTab === "editor" ? 1 : 0,
                pointerEvents: activeTab === "editor" ? "auto" : "none",
                transition: "opacity 0.25s ease-in-out",
                zIndex: activeTab === "editor" ? 1 : 0,
              }}
            >
              <div style={s.lrcList} ref={lrcListRef}>
                {lrcLines.length === 0 ? (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "60px 20px",
                      gap: 12,
                    }}
                  >
                    <IconEmpty />
                    <div style={{ color: "#444", fontSize: 15, fontWeight: 500 }}>No lyrics loaded</div>
                    <div style={{ color: "#333", fontSize: 12, textAlign: "center", maxWidth: 280, lineHeight: 1.6 }}>
                      Upload a lyrics file (.txt or .lrc) from the sidebar to start timing your song.
                    </div>
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
                          display: "flex",
                          alignItems: "center",
                          padding: "8px 12px",
                          borderRadius: 6,
                          marginBottom: 2,
                          cursor: "pointer",
                          transition: "background 0.12s, border-color 0.12s",
                          background: isFocused
                            ? "#141430"
                            : isActive
                              ? "#121228"
                              : i % 2 === 0
                                ? "#0c0c14"
                                : "transparent",
                          borderLeft: isFocused
                            ? "3px solid #6c5ce7"
                            : isActive
                              ? "3px solid #3a3a6a"
                              : "3px solid transparent",
                        }}
                        onClick={() => {
                          if (playing && audioRef.current) {
                            const t = parseFloat(audioRef.current.currentTime.toFixed(2));
                            setLrcLines((prev) => {
                              const updated = [...prev];
                              updated[i] = { ...updated[i], time: t };
                              return updated;
                            });
                            setFocusLine(Math.min(i + 1, lrcLines.length - 1));
                          } else {
                            setFocusLine(i);
                            if (hasTime) seekTo(line.time);
                          }
                        }}
                      >
                        {/* Timestamp */}
                        <input
                          style={{
                            width: 80,
                            background: "#08080f",
                            border: `1px solid ${hasTime ? "#1a2a1a" : "#2a1a1a"}`,
                            borderRadius: 4,
                            color: hasTime ? "#7ec87e" : "#554",
                            padding: "4px 8px",
                            fontSize: 12,
                            marginRight: 12,
                            fontFamily: "monospace",
                            textAlign: "center" as const,
                            outline: "none",
                            transition: "border-color 0.15s",
                          }}
                          value={formatTime(line.time)}
                          onChange={(e) => handleTimeChange(i, e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        {/* Line number */}
                        <span
                          style={{
                            width: 28,
                            fontSize: 11,
                            color: "#333",
                            textAlign: "right" as const,
                            marginRight: 10,
                            flexShrink: 0,
                            fontFamily: "monospace",
                          }}
                        >
                          {i + 1}
                        </span>
                        {/* Lyric text */}
                        <span
                          style={{
                            color: isFocused ? "#fff" : isActive ? "#ddd" : "#888",
                            fontSize: isFocused ? 15 : 14,
                            fontWeight: isFocused ? 600 : 400,
                            transition: "all 0.15s",
                            flex: 1,
                          }}
                        >
                          {line.text}
                        </span>
                        {/* Status dot */}
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            flexShrink: 0,
                            background: hasTime ? "#4caf50" : "#252525",
                            transition: "background 0.2s",
                            boxShadow: hasTime ? "0 0 6px rgba(76,175,80,0.4)" : "none",
                          }}
                        />
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* --- PREVIEW TAB --- */}
            <div
              style={{
                ...s.previewContainer,
                position: "absolute",
                inset: 0,
                opacity: activeTab === "preview" ? 1 : 0,
                pointerEvents: activeTab === "preview" ? "auto" : "none",
                transition: "opacity 0.25s ease-in-out",
                zIndex: activeTab === "preview" ? 1 : 0,
              }}
            >
              {filteredLines.length > 0 ? (
                <LyricVideoPreview
                  project={project}
                  lrcLines={filteredLines}
                  currentTime={currentTime}
                  coverUrl={coverUrl}
                  visualConfig={visualConfig}
                />
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 12,
                  }}
                >
                  <IconVideoOff />
                  <div style={{ color: "#444", fontSize: 15, fontWeight: 500 }}>No timestamps set yet</div>
                  <div style={{ color: "#333", fontSize: 12, textAlign: "center", maxWidth: 280, lineHeight: 1.6 }}>
                    Switch to the Timing Editor tab and record timestamps to see a preview of your lyric video.
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ==================== AUDIO PLAYER BAR ==================== */}
          {audioUrl && (
            <div style={s.audioBar}>
              <audio ref={audioRef} src={audioUrl} preload="auto" />
              <button
                style={s.playBtn}
                onClick={togglePlay}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "#7c6cf7")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "#6c5ce7")}
              >
                {playing ? "\u275A\u275A" : "\u25B6"}
              </button>
              <span style={s.timeDisplay}>{formatTime(currentTime)}</span>
              <input
                type="range"
                min={0}
                max={project.duration || 100}
                step={0.01}
                value={currentTime}
                onChange={handleSliderChange}
                onMouseDown={handleSliderPointerDown}
                onMouseUp={handleSliderPointerUp}
                onTouchStart={handleSliderPointerDown}
                onTouchEnd={handleSliderPointerUp}
                style={s.slider}
              />
              <span style={s.timeDisplay}>{formatTime(project.duration || 0)}</span>
            </div>
          )}
        </div>

        {/* ==================== RIGHT PANEL: VISUAL EDITOR ==================== */}
        <div style={s.rightPanel}>
          <div
            style={{
              padding: "12px 20px",
              borderBottom: "1px solid #1e1e2a",
              fontSize: 11,
              color: "#666",
              textTransform: "uppercase" as const,
              letterSpacing: 1.2,
              fontWeight: 600,
            }}
          >
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
