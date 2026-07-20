import React, { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../utils/api";
import { parseLrc, parseAnyLyrics, formatTime, lrcLinesToString } from "../utils/lrc";
import { defaultVisualConfig, mergeConfig } from "../utils/visualDefaults";
import type { Project, LrcLine, VisualConfig } from "../types";
import LyricVideoPreview from "../components/LyricVideoPreview";
import VisualEditor from "../components/VisualEditor";

// ─── Toast ───────────────────────────────────────────────────────────
interface Toast { id: number; msg: string; type: "info" | "ok" | "err" }
let _tid = 0;

// ─── Component ───────────────────────────────────────────────────────
export default function ProjectEditor() {
  const { name } = useParams<{ name: string }>();
  const nav = useNavigate();

  // Data
  const [project, setProject] = useState<Project | null>(null);
  const [lines, setLines] = useState<LrcLine[]>([]);
  const [cfg, setCfg] = useState<VisualConfig>(defaultVisualConfig);

  // UI
  const [tab, setTab] = useState<"editor" | "preview">("editor");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [busy, setBusy] = useState("");
  const [focus, setFocus] = useState(0);

  // Audio
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [activeLine, setActiveLine] = useState(-1);

  // Refs
  const audioRef = useRef<HTMLAudioElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();

  // ─── CRITICAL: Seeking state ─────────────────────────────────────
  // This ref is the single source of truth for whether the user is
  // dragging the slider. When true, timeupdate is completely ignored.
  const isSeeking = useRef(false);
  // Whether audio was playing before the user started dragging
  const wasPlaying = useRef(false);

  // ─── Toast helper ────────────────────────────────────────────────
  const toast = useCallback((msg: string, type: Toast["type"] = "info") => {
    const id = ++_tid;
    setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500);
  }, []);

  // ─── Load project ────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!name) return;
    try {
      const p = await api.getProject(name);
      setProject(p);
      setCfg(mergeConfig(defaultVisualConfig, p.visual_config));
      if (p.lrc_file) {
        try {
          const r = await api.getLrc(name);
          const parsed = parseLrc(r.content);
          if (parsed.length) { setLines(parsed); return; }
        } catch {}
      }
      if (p.lyrics_file) {
        try {
          const r = await api.getLyricsText(name);
          setLines(parseAnyLyrics(r.content));
        } catch {}
      }
    } catch (e: any) { toast("Load failed: " + e.message, "err"); }
  }, [name, toast]);

  useEffect(() => { load(); }, [load]);

  // ─── Audio timeupdate ────────────────────────────────────────────
  // CRITICAL: this MUST check isSeeking.current on every tick
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => {
      // When the user is dragging the slider, do NOT update time.
      // This is the fix for the "jumps back" bug.
      if (isSeeking.current) return;
      setTime(audio.currentTime);
      let a = -1;
      for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].time >= 0 && audio.currentTime >= lines[i].time) { a = i; break; }
      }
      setActiveLine(a);
    };
    const onEnd = () => setPlaying(false);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnd);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnd);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
    };
  }, [lines]);

  // ─── Keyboard shortcuts ──────────────────────────────────────────
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = (e.target as HTMLElement)?.tagName;
      if (t === "INPUT" || t === "TEXTAREA") return;
      if (tab !== "editor") return;
      if (e.code === "Space") { e.preventDefault(); togglePlay(); }
      else if (e.code === "Enter") { e.preventDefault(); stamp(); }
      else if (e.code === "ArrowDown") { e.preventDefault(); setFocus(f => Math.min(f + 1, lines.length - 1)); }
      else if (e.code === "ArrowUp") { e.preventDefault(); setFocus(f => Math.max(f - 1, 0)); }
      else if (e.code === "Backspace" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setLines(p => { const u = [...p]; u[focus] = { ...u[focus], time: -1 }; return u; });
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  // Auto-scroll focused line
  useEffect(() => {
    if (tab === "editor" && listRef.current && focus >= 0) {
      const el = listRef.current.children[focus] as HTMLElement;
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [focus, tab]);

  // ─── Play / Pause ────────────────────────────────────────────────
  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) { a.play(); } else { a.pause(); }
  };

  // ─── Seek (called from clicking lyric lines) ────────────────────
  const seekTo = (t: number) => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = t;
    setTime(t);
  };

  // ─── CRITICAL: Slider seeking handlers ───────────────────────────
  // These three functions work together to prevent the "jump back" bug:
  //
  // 1. onMouseDown/onTouchStart: mark seeking=true, pause audio
  // 2. onChange: update React state + audio.currentTime
  // 3. onMouseUp/onTouchEnd: mark seeking=false, resume if was playing
  //
  // The timeupdate handler checks isSeeking.current and skips updates
  // when true. This prevents React state from being overwritten.

  const onSliderDown = useCallback(() => {
    isSeeking.current = true;
    const a = audioRef.current;
    wasPlaying.current = a ? !a.paused : false;
    if (a && !a.paused) a.pause();
  }, []);

  const onSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setTime(v);
    const a = audioRef.current;
    if (a) a.currentTime = v;
  }, []);

  const onSliderUp = useCallback(() => {
    // Small delay to let the audio element settle at the new position
    // before re-enabling timeupdate updates
    setTimeout(() => {
      isSeeking.current = false;
      const a = audioRef.current;
      if (wasPlaying.current && a) a.play();
    }, 50);
  }, []);

  // ─── Stamp ───────────────────────────────────────────────────────
  const stamp = () => {
    const a = audioRef.current;
    if (!a || !lines.length) return;
    const t = parseFloat(a.currentTime.toFixed(2));
    setLines(p => { const u = [...p]; u[focus] = { ...u[focus], time: t }; return u; });
    setFocus(f => Math.min(f + 1, lines.length - 1));
  };

  // ─── Visual config (debounced save) ──────────────────────────────
  const onCfgChange = (c: VisualConfig) => {
    setCfg(c);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (name) api.updateProject(name, { visual_config: c }).catch(() => {});
    }, 800);
  };

  // ─── File uploads ────────────────────────────────────────────────
  const upload = async (type: "audio" | "lyrics" | "cover", file: File) => {
    if (!name) return;
    setBusy(`Uploading ${type}...`);
    try {
      if (type === "lyrics") {
        const r = await api.uploadLyrics(name, file);
        setLines(parseAnyLyrics(r.content));
        toast(r.format === "lrc" ? "LRC imported with timestamps" : "Lyrics loaded", "ok");
      } else if (type === "audio") {
        await api.uploadAudio(name, file);
        toast("Audio uploaded", "ok");
      } else {
        await api.uploadCover(name, file);
        toast("Cover uploaded", "ok");
      }
      await load();
    } catch (e: any) { toast(e.message, "err"); }
    setBusy("");
  };

  const saveLrc = async () => {
    if (!name) return;
    const c = lrcLinesToString(lines);
    if (!c.trim()) { toast("No timestamps set", "err"); return; }
    try {
      await api.saveLrc(name, c);
      await load();
      toast("Saved", "ok");
    } catch (e: any) { toast(e.message, "err"); }
  };

  const handleTimeEdit = (i: number, v: string) => {
    if (v === "--:--.--") return;
    const m = v.match(/^(\d{1,2}):(\d{1,2}(?:\.\d*)?)$/);
    if (!m) return;
    const t = parseInt(m[1]) * 60 + parseFloat(m[2]);
    setLines(p => { const u = [...p]; u[i] = { ...u[i], time: t }; return u; });
  };

  const doExport = async () => {
    if (!name) return;
    await api.updateProject(name, { visual_config: cfg });
    if (lines.some(l => l.time >= 0)) await api.saveLrc(name, lrcLinesToString(lines));
    toast("Saved. Run: python render.py " + name, "ok");
  };

  // ─── Derived ─────────────────────────────────────────────────────
  if (!project) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#0a0a0f", color: "#555" }}>
      Loading project...
    </div>
  );

  const audioUrl = project.audio_file ? `/static/projects/${name}/audio/${project.audio_file}` : null;
  const coverUrl = project.cover_file ? `/static/projects/${name}/assets/${project.cover_file}` : null;
  const stamped = lines.filter(l => l.time >= 0).length;
  const stampedLines = lines.filter(l => l.time >= 0);

  // ─── Render ──────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#0a0a0f", color: "#ccc", overflow: "hidden" }}>

      {/* ── Top bar ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px", background: "#111118", borderBottom: "1px solid #1c1c28", flexShrink: 0 }}>
        <button onClick={() => nav("/")} style={{ background: "none", border: "none", color: "#777", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 18 }}>&larr;</span> Projects
        </button>
        <div style={{ color: "#eee", fontWeight: 600, fontSize: 15 }}>{project.title} <span style={{ color: "#555", fontWeight: 400 }}>by {project.artist}</span></div>
        <div style={{ width: 80 }} />
      </div>

      {/* ── Body ── */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* ── Left sidebar ── */}
        <div style={{ width: 260, background: "#111118", borderRight: "1px solid #1c1c28", padding: 16, overflowY: "auto", flexShrink: 0 }}>

          {/* Audio */}
          <Section title="Audio">
            {project.audio_file ? (
              <Info icon="&#9835;" text={`${project.audio_file} (${project.duration?.toFixed(1)}s)`} color="#6fcf70" />
            ) : (
              <UploadBox label="Upload audio" accept="audio/*" onFile={f => upload("audio", f)} />
            )}
          </Section>

          {/* Lyrics */}
          <Section title="Lyrics">
            {lines.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#888", marginBottom: 4 }}>
                  <span>{lines.length} lines</span>
                  <span style={{ color: stamped === lines.length ? "#6fcf70" : "#888" }}>{stamped}/{lines.length} timed</span>
                </div>
                <div style={{ height: 3, background: "#1a1a2a", borderRadius: 2 }}>
                  <div style={{ height: "100%", width: `${(stamped / lines.length) * 100}%`, background: "#6c5ce7", borderRadius: 2, transition: "width 0.3s" }} />
                </div>
              </div>
            )}
            <UploadBox label="Upload lyrics (.txt / .lrc)" accept=".txt,.lrc" onFile={f => upload("lyrics", f)} />
            {lines.length > 0 && (
              <>
                <Btn onClick={saveLrc}>Save Timestamps</Btn>
                <BtnGhost onClick={() => { setLines(p => p.map(l => ({ ...l, time: -1 }))); setFocus(0); }}>Clear All</BtnGhost>
              </>
            )}
          </Section>

          {/* Cover */}
          <Section title="Cover">
            {coverUrl ? (
              <>
                <img src={coverUrl} alt="" style={{ width: "100%", borderRadius: 8, marginBottom: 8 }} />
                <UploadBox label="Replace" accept="image/*" onFile={f => upload("cover", f)} small />
              </>
            ) : (
              <UploadBox label="Upload cover image" accept="image/*" onFile={f => upload("cover", f)} />
            )}
          </Section>

          {/* Actions */}
          <Section title="Export">
            <Btn onClick={doExport}>Export Video</Btn>
            <BtnGhost onClick={saveLrc}>Save Project</BtnGhost>
          </Section>

          {/* Shortcuts hint */}
          {tab === "editor" && (
            <div style={{ fontSize: 11, color: "#444", lineHeight: 1.7, marginTop: 8, borderTop: "1px solid #1a1a28", paddingTop: 12 }}>
              <Shortcut k="Space" d="Play / Pause" />
              <Shortcut k="Enter" d="Stamp line" />
              <Shortcut k="&#8593;&#8595;" d="Navigate" />
              <Shortcut k="Ctrl+&#9003;" d="Clear time" />
            </div>
          )}
        </div>

        {/* ── Center ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Tabs */}
          <div style={{ display: "flex", background: "#111118", borderBottom: "1px solid #1c1c28", flexShrink: 0 }}>
            <Tab active={tab === "editor"} onClick={() => setTab("editor")}>Timing Editor</Tab>
            <Tab active={tab === "preview"} onClick={() => setTab("preview")}>Video Preview</Tab>
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>

            {/* Editor */}
            <div style={{ position: "absolute", inset: 0, display: tab === "editor" ? "flex" : "none", flexDirection: "column" }}>
              <div ref={listRef} style={{ flex: 1, overflowY: "auto", padding: "10px 16px" }}>
                {lines.length === 0 ? (
                  <Empty icon="&#128196;" text="Upload a lyrics file to start timing" />
                ) : lines.map((line, i) => {
                  const focused = i === focus;
                  const active = i === activeLine;
                  const has = line.time >= 0;
                  return (
                    <div key={i}
                      onClick={() => {
                        if (playing && audioRef.current) {
                          const t = parseFloat(audioRef.current.currentTime.toFixed(2));
                          setLines(p => { const u = [...p]; u[i] = { ...u[i], time: t }; return u; });
                          setFocus(Math.min(i + 1, lines.length - 1));
                        } else {
                          setFocus(i);
                          if (has) seekTo(line.time);
                        }
                      }}
                      style={{
                        display: "flex", alignItems: "center", padding: "7px 10px",
                        borderRadius: 6, marginBottom: 1, cursor: "pointer",
                        background: focused ? "rgba(108,92,231,0.12)" : active ? "rgba(108,92,231,0.06)" : "transparent",
                        borderLeft: focused ? "3px solid #6c5ce7" : "3px solid transparent",
                        transition: "background 0.1s",
                      }}
                    >
                      <input
                        style={{
                          width: 76, background: "#0c0c16", border: `1px solid ${has ? "#253025" : "#302525"}`,
                          borderRadius: 4, color: has ? "#6fcf70" : "#554", padding: "3px 6px",
                          fontSize: 11, fontFamily: "monospace", textAlign: "center", outline: "none",
                        }}
                        value={formatTime(line.time)}
                        onChange={e => handleTimeEdit(i, e.target.value)}
                        onClick={e => e.stopPropagation()}
                      />
                      <span style={{ width: 28, fontSize: 10, color: "#333", textAlign: "right", margin: "0 8px", flexShrink: 0 }}>{i + 1}</span>
                      <span style={{
                        flex: 1, fontSize: focused ? 14 : 13,
                        color: focused ? "#eee" : active ? "#ccc" : "#888",
                        fontWeight: focused ? 600 : 400,
                      }}>
                        {line.text}
                      </span>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: has ? "#4caf50" : "#2a2a2a", flexShrink: 0 }} />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Preview */}
            <div style={{ position: "absolute", inset: 0, display: tab === "preview" ? "flex" : "none", alignItems: "center", justifyContent: "center", background: "#060609" }}>
              {stampedLines.length > 0 ? (
                <LyricVideoPreview project={project} lrcLines={stampedLines} currentTime={time} coverUrl={coverUrl} visualConfig={cfg} />
              ) : (
                <Empty icon="&#127916;" text="Set timestamps in the Timing Editor to preview" />
              )}
            </div>
          </div>

          {/* ── Audio bar ── */}
          {audioUrl && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 20px", background: "#0c0c14", borderTop: "1px solid #1c1c28", flexShrink: 0 }}>
              <audio ref={audioRef} src={audioUrl} preload="auto" />

              {/* Play button */}
              <button onClick={togglePlay} style={{
                width: 34, height: 34, borderRadius: "50%", border: "none",
                background: "#6c5ce7", color: "#fff", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, flexShrink: 0,
              }}>
                {playing ? "\u275A\u275A" : "\u25B6"}
              </button>

              {/* Current time */}
              <span style={{ fontFamily: "monospace", fontSize: 12, color: "#888", minWidth: 72 }}>
                {formatTime(time)}
              </span>

              {/* ── THE SLIDER ── */}
              {/* onMouseDown+onTouchStart: mark seeking, pause audio */}
              {/* onChange: update time state + audio.currentTime */}
              {/* onMouseUp+onTouchEnd: unmark seeking (with 50ms delay), resume */}
              <input
                type="range"
                min={0}
                max={project.duration || 100}
                step={0.01}
                value={time}
                onChange={onSliderChange}
                onMouseDown={onSliderDown}
                onMouseUp={onSliderUp}
                onTouchStart={onSliderDown}
                onTouchEnd={onSliderUp}
                style={{ flex: 1, accentColor: "#6c5ce7", cursor: "pointer", height: 4 }}
              />

              {/* Duration */}
              <span style={{ fontFamily: "monospace", fontSize: 12, color: "#555", minWidth: 72 }}>
                {formatTime(project.duration || 0)}
              </span>
            </div>
          )}
        </div>

        {/* ── Right panel ── */}
        <div style={{ width: 300, background: "#111118", borderLeft: "1px solid #1c1c28", flexShrink: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "10px 16px", borderBottom: "1px solid #1c1c28", fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 1.2, fontWeight: 600 }}>
            Visual Settings
          </div>
          <div style={{ flex: 1, overflow: "hidden" }}>
            <VisualEditor config={cfg} onChange={onCfgChange} />
          </div>
        </div>
      </div>

      {/* ── Toasts ── */}
      <div style={{ position: "fixed", top: 16, right: 16, zIndex: 999, display: "flex", flexDirection: "column", gap: 8 }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            padding: "10px 16px", borderRadius: 8, fontSize: 13,
            background: t.type === "ok" ? "#1a3a1a" : t.type === "err" ? "#3a1a1a" : "#1a1a3a",
            color: t.type === "ok" ? "#7ecf7e" : t.type === "err" ? "#cf7e7e" : "#9e9eff",
            border: `1px solid ${t.type === "ok" ? "#2a4a2a" : t.type === "err" ? "#4a2a2a" : "#2a2a4a"}`,
            animation: "fadeIn 0.2s ease",
            maxWidth: 320,
          }}>
            {t.msg}
          </div>
        ))}
      </div>

      {/* ── Loading overlay ── */}
      {busy && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 998, color: "#888", fontSize: 14,
        }}>
          {busy}
        </div>
      )}
    </div>
  );
}

// ─── Small UI components ─────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 8, fontWeight: 600 }}>{title}</div>
      {children}
    </div>
  );
}

function UploadBox({ label, accept, onFile, small }: { label: string; accept: string; onFile: (f: File) => void; small?: boolean }) {
  return (
    <label style={{
      display: "block", background: "#0c0c16", border: "1px dashed #2a2a3a",
      borderRadius: 8, padding: small ? "8px" : "14px",
      textAlign: "center", cursor: "pointer", color: "#555", fontSize: 12, marginBottom: 8,
      transition: "border-color 0.2s",
    }}>
      {label}
      <input type="file" accept={accept} hidden onChange={e => e.target.files?.[0] && onFile(e.target.files[0])} />
    </label>
  );
}

function Btn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      width: "100%", padding: "8px 14px", borderRadius: 6, border: "none",
      background: "#6c5ce7", color: "#fff", fontSize: 12, fontWeight: 500,
      cursor: "pointer", marginBottom: 6, transition: "background 0.15s",
    }}>
      {children}
    </button>
  );
}

function BtnGhost({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      width: "100%", padding: "7px 14px", borderRadius: 6,
      border: "1px solid #2a2a3a", background: "transparent",
      color: "#888", fontSize: 12, cursor: "pointer", marginBottom: 6,
    }}>
      {children}
    </button>
  );
}

function Info({ icon, text, color }: { icon: string; text: string; color: string }) {
  return (
    <div style={{ fontSize: 12, color, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
      <span>{icon}</span> {text}
    </div>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      padding: "10px 20px", border: "none", background: "none",
      color: active ? "#fff" : "#666", fontSize: 13, fontWeight: 500,
      cursor: "pointer", borderBottom: active ? "2px solid #6c5ce7" : "2px solid transparent",
      transition: "color 0.15s",
    }}>
      {children}
    </button>
  );
}

function Empty({ icon, text }: { icon: string; text: string }) {
  return (
    <div style={{ textAlign: "center", padding: 40, color: "#444" }}>
      <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.3 }}>{icon}</div>
      <div style={{ fontSize: 13 }}>{text}</div>
    </div>
  );
}

function Shortcut({ k, d }: { k: string; d: string }) {
  return (
    <div><span style={{ color: "#6c5ce7", fontFamily: "monospace" }}>{k}</span> {d}</div>
  );
}
