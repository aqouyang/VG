import React, { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../utils/api";
import { parseLrc, parseAnyLyrics, formatTime, lrcLinesToString } from "../utils/lrc";
import { defaultVisualConfig, mergeConfig } from "../utils/visualDefaults";
import type { Project, LrcLine, VisualConfig, ProjectLayouts, SavedLayout } from "../types";
import LyricVideoPreview from "../components/LyricVideoPreview";
import VisualEditor from "../components/VisualEditor";
import { migrateProjectLayouts, getActiveConfig, createLayout, duplicateLayout } from "../utils/layouts";

const SP = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

interface Toast { id: number; msg: string; type: "info" | "ok" | "err" }
let _tid = 0;

export default function ProjectEditor() {
  const { name } = useParams<{ name: string }>();
  const nav = useNavigate();

  const [project, setProject] = useState<Project | null>(null);
  const [lines, setLines] = useState<LrcLine[]>([]);
  const [cfg, setCfg] = useState<VisualConfig>(defaultVisualConfig);
  const [layouts, setLayouts] = useState<ProjectLayouts | null>(null);
  const [tab, setTab] = useState<"editor" | "preview">("editor");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [busy, setBusy] = useState("");
  const [focus, setFocus] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [activeLine, setActiveLine] = useState(-1);
  const [speed, setSpeed] = useState(1);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [undoStack, setUndoStack] = useState<LrcLine[][]>([]);
  const [renderMode, setRenderMode] = useState<"auto" | "fast" | "record" | "advanced">("auto");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const linesRef = useRef(lines);
  linesRef.current = lines;

  // ─── SEEKING: simple cooldown approach ────────────────────────────
  // isSeeking: true while the user is dragging the slider.
  // cooldown: a timestamp. timeupdate events are ignored until Date.now() > cooldown.
  // This replaces the old seekTarget/seekId system which could lock permanently.
  const isSeeking = useRef(false);
  const wasPlaying = useRef(false);
  const timeRef = useRef(0);
  const seekCooldown = useRef(0); // Date.now() after which timeupdate is accepted

  const toast = useCallback((msg: string, type: Toast["type"] = "info") => {
    const id = ++_tid;
    setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500);
  }, []);

  // ─── AUDIO ELEMENT ────────────────────────────────────────────────
  const prevAudioEl = useRef<HTMLAudioElement | null>(null);

  const audioCallbackRef = useCallback((el: HTMLAudioElement | null) => {
    if (prevAudioEl.current && prevAudioEl.current !== el) {
      const old = prevAudioEl.current;
      old.removeEventListener("timeupdate", onTimeUpdate);
      old.removeEventListener("play", onPlay);
      old.removeEventListener("pause", onPause);
      old.removeEventListener("ended", onEnded);
    }
    audioRef.current = el;
    prevAudioEl.current = el;
    if (!el) return;
    if (timeRef.current > 0) {
      el.currentTime = timeRef.current;
      seekCooldown.current = Date.now() + 500;
    }
    el.addEventListener("timeupdate", onTimeUpdate);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnded);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onTimeUpdate(this: HTMLAudioElement) {
    if (isSeeking.current) return;
    if (Date.now() < seekCooldown.current) return;
    const t = this.currentTime;
    timeRef.current = t;
    setTime(t);
    const ll = linesRef.current;
    let a = -1;
    for (let i = ll.length - 1; i >= 0; i--) {
      if (ll[i].time >= 0 && t >= ll[i].time) { a = i; break; }
    }
    setActiveLine(a);
  }
  function onPlay() { setPlaying(true); }
  function onPause() { setPlaying(false); }
  function onEnded() { setPlaying(false); }

  // ─── Load project ─────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!name) return;
    const savedTime = timeRef.current;
    try {
      const p = await api.getProject(name);
      setProject(p);
      // Multi-layout migration: if project has no layouts, create them
      const projectLayouts = p.layouts || migrateProjectLayouts(p);
      setLayouts(projectLayouts);
      setCfg(getActiveConfig({ ...p, layouts: projectLayouts }));
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
    if (savedTime > 0) {
      timeRef.current = savedTime;
      setTime(savedTime);
      seekCooldown.current = Date.now() + 500;
      if (audioRef.current) audioRef.current.currentTime = savedTime;
    }
  }, [name, toast]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed]);

  // Keyboard shortcuts
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (tab !== "editor") return;
      if (e.code === "Space") { e.preventDefault(); togglePlay(); }
      else if (e.code === "Enter") { e.preventDefault(); stamp(); }
      else if (e.code === "ArrowDown") { e.preventDefault(); setFocus(f => Math.min(f + 1, lines.length - 1)); }
      else if (e.code === "ArrowUp") { e.preventDefault(); setFocus(f => Math.max(f - 1, 0)); }
      else if (e.code === "ArrowLeft") { e.preventDefault(); skip(-2); }
      else if (e.code === "ArrowRight") { e.preventDefault(); skip(2); }
      else if (e.code === "BracketLeft") { e.preventDefault(); nudge(focus, -0.1); }
      else if (e.code === "BracketRight") { e.preventDefault(); nudge(focus, 0.1); }
      else if (e.code === "KeyZ" && (e.ctrlKey || e.metaKey) && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (e.code === "Tab") { e.preventDefault(); const n = lines.findIndex((l, i) => i > focus && l.time < 0); if (n >= 0) setFocus(n); }
      else if (e.code === "Backspace" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); pushUndo(); setLines(p => { const u = [...p]; u[focus] = { ...u[focus], time: -1 }; return u; }); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  useEffect(() => {
    if (tab === "editor" && listRef.current && focus >= 0) {
      const el = listRef.current.children[focus] as HTMLElement;
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [focus, tab]);

  // ─── SEEK (single function, sets cooldown) ────────────────────────
  const performSeek = useCallback((t: number) => {
    timeRef.current = t;
    setTime(t);
    seekCooldown.current = Date.now() + 300; // block stale events for 300ms
    if (audioRef.current) audioRef.current.currentTime = t;
  }, []);

  const togglePlay = () => {
    const a = audioRef.current; if (!a) return;
    if (a.paused) {
      a.currentTime = timeRef.current;
      seekCooldown.current = Date.now() + 200;
      a.play();
    } else {
      a.pause();
    }
  };

  const seekTo = (t: number) => performSeek(t);

  const skip = (d: number) => {
    const a = audioRef.current; if (!a) return;
    performSeek(Math.max(0, Math.min(a.duration || 0, timeRef.current + d)));
  };

  // ─── SLIDER ───────────────────────────────────────────────────────
  const commitSeek = useCallback(() => {
    const t = timeRef.current;
    performSeek(t);
    setTimeout(() => {
      isSeeking.current = false;
      const a = audioRef.current;
      if (a && wasPlaying.current) {
        a.currentTime = t;
        a.play();
      }
    }, 100);
  }, [performSeek]);

  const onSliderDown = useCallback(() => {
    isSeeking.current = true;
    const a = audioRef.current;
    wasPlaying.current = a ? !a.paused : false;
    if (a && !a.paused) a.pause();
    const onUp = () => {
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchend", onUp);
      commitSeek();
    };
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchend", onUp);
  }, [commitSeek]);

  const onSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    timeRef.current = v;
    setTime(v);
    if (audioRef.current) audioRef.current.currentTime = v;
  }, []);

  // ─── Stamp / Undo / Nudge ────────────────────────────────────────
  const pushUndo = () => setUndoStack(p => [...p.slice(-19), lines.map(l => ({ ...l }))]);
  const undo = () => { setUndoStack(p => { if (!p.length) return p; setLines(p[p.length - 1]); toast("Undo"); return p.slice(0, -1); }); };

  const stamp = () => {
    const a = audioRef.current;
    if (!a || !lines.length) return;
    pushUndo();
    const t = parseFloat(a.currentTime.toFixed(2));
    setLines(p => { const u = [...p]; u[focus] = { ...u[focus], time: t }; return u; });
    if (autoAdvance) setFocus(f => Math.min(f + 1, lines.length - 1));
  };

  const nudge = (i: number, d: number) => {
    if (i < 0 || i >= lines.length || lines[i].time < 0) return;
    pushUndo();
    setLines(p => { const u = [...p]; u[i] = { ...u[i], time: Math.max(0, parseFloat((u[i].time + d).toFixed(2))) }; return u; });
  };

  const shiftAll = (d: number) => {
    pushUndo();
    setLines(p => p.map(l => l.time >= 0 ? { ...l, time: Math.max(0, parseFloat((l.time + d).toFixed(2))) } : l));
    toast(`Shifted ${d > 0 ? "+" : ""}${d.toFixed(1)}s`, "ok");
  };

  const onCfgChange = (c: VisualConfig) => {
    setCfg(c);
    // Update the active layout in the layouts state
    if (layouts) {
      const updated = { ...layouts, items: { ...layouts.items } };
      const activeLayout = updated.items[updated.activeId];
      if (activeLayout) {
        updated.items[updated.activeId] = { ...activeLayout, config: c };
        setLayouts(updated);
      }
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (name && layouts) {
        // Save visual_config (backward compat) + layouts
        const updatedLayouts = { ...layouts, items: { ...layouts.items } };
        const al = updatedLayouts.items[updatedLayouts.activeId];
        if (al) updatedLayouts.items[updatedLayouts.activeId] = { ...al, config: c };
        api.updateProject(name, { visual_config: c, layouts: updatedLayouts }).catch(() => {});
      }
    }, 800);
  };

  // ─── Layout switching ─────────────────────────────────────────────
  const switchLayout = (layoutId: string) => {
    if (!layouts || !layouts.items[layoutId]) return;
    const updated = { ...layouts, activeId: layoutId };
    setLayouts(updated);
    setCfg(mergeConfig(defaultVisualConfig, updated.items[layoutId].config));
    // Do NOT reset audio time
  };

  const addLayout = (aspectRatio: string) => {
    if (!layouts) return;
    const names: Record<string, string> = { "16:9": "Landscape", "9:16": "Portrait", "1:1": "Square", "4:3": "Classic" };
    const layout = createLayout(names[aspectRatio] || aspectRatio, aspectRatio);
    const updated = {
      ...layouts,
      order: [...layouts.order, layout.id],
      items: { ...layouts.items, [layout.id]: layout },
    };
    setLayouts(updated);
    switchLayout(layout.id);
  };

  const deleteLayout = (layoutId: string) => {
    if (!layouts || layouts.order.length <= 1) return;
    const updated = { ...layouts, items: { ...layouts.items }, order: layouts.order.filter(id => id !== layoutId) };
    delete updated.items[layoutId];
    if (updated.activeId === layoutId) {
      updated.activeId = updated.order[0];
      setCfg(mergeConfig(defaultVisualConfig, updated.items[updated.activeId]?.config));
    }
    setLayouts(updated);
  };

  const upload = async (type: "audio" | "lyrics" | "cover", file: File) => {
    if (!name) return;
    setBusy(`Uploading ${type}...`);
    try {
      if (type === "lyrics") {
        const r = await api.uploadLyrics(name, file);
        setLines(parseAnyLyrics(r.content));
        toast(r.format === "lrc" ? "LRC imported" : "Lyrics loaded", "ok");
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
    try { await api.saveLrc(name, c); toast("Saved", "ok"); } catch (e: any) { toast(e.message, "err"); }
  };

  const handleTimeEdit = (i: number, v: string) => {
    if (v === "--:--.--") return;
    const m = v.match(/^(\d{1,2}):(\d{1,2}(?:\.\d*)?)$/);
    if (!m) return;
    pushUndo();
    setLines(p => { const u = [...p]; u[i] = { ...u[i], time: parseInt(m[1]) * 60 + parseFloat(m[2]) }; return u; });
  };

  const doExport = async () => {
    if (!name) return;
    await api.updateProject(name, { visual_config: cfg });
    if (lines.some(l => l.time >= 0)) await api.saveLrc(name, lrcLinesToString(lines));
    try {
      await api.createJob(name, undefined, renderMode);
      toast("Export queued. See the export window for progress.", "ok");
    } catch (e: any) { toast("Export failed: " + e.message, "err"); }
  };

  if (!project) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#0a0a0f", color: "#555" }}>Loading...</div>
  );

  const audioUrl = project.audio_file ? `/static/projects/${name}/audio/${project.audio_file}` : null;
  const coverUrl = project.cover_file
    ? `/static/projects/${name}/assets/${project.cover_file}?v=${project.cover_version ?? 0}`
    : null;
  const stamped = lines.filter(l => l.time >= 0).length;
  const stampedLines = lines.filter(l => l.time >= 0);
  const lineDur = (i: number) => { if (lines[i].time < 0) return ""; const n = lines.slice(i + 1).find(l => l.time >= 0); return n ? (n.time - lines[i].time).toFixed(1) + "s" : ""; };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#0a0a0f", color: "#ccc", overflow: "hidden" }}>
      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: `${SP.sm}px ${SP.xl}px`, background: "#111118", borderBottom: "1px solid #1c1c28", flexShrink: 0 }}>
        <button onClick={() => nav("/")} style={{ background: "none", border: "none", color: "#777", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 18 }}>&larr;</span> Projects
        </button>
        <div style={{ color: "#eee", fontWeight: 600, fontSize: 15 }}>
          {project.title} <span style={{ color: "#555", fontWeight: 400 }}>by {project.artist}</span>
        </div>
        <div style={{ width: 80 }} />
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* LEFT SIDEBAR */}
        <div style={{ width: 260, background: "#111118", borderRight: "1px solid #1c1c28", padding: SP.lg, overflowY: "auto", flexShrink: 0, display: "flex", flexDirection: "column", gap: SP.xl }}>
          <Panel title="Audio">
            {project.audio_file ? (
              <PanelInfo text={`${project.audio_file} (${project.duration?.toFixed(1)}s)`} ok />
            ) : (
              <FileInput label="Upload audio" accept="audio/*" onFile={f => upload("audio", f)} />
            )}
          </Panel>
          <Panel title="Lyrics">
            {lines.length > 0 && (
              <div style={{ marginBottom: SP.md }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#888", marginBottom: SP.xs }}>
                  <span>{lines.length} lines</span>
                  <span style={{ color: stamped === lines.length ? "#6fcf70" : "#888" }}>{stamped}/{lines.length}</span>
                </div>
                <div style={{ height: 3, background: "#1a1a2a", borderRadius: 2 }}>
                  <div style={{ height: "100%", width: `${lines.length ? (stamped / lines.length) * 100 : 0}%`, background: "#6c5ce7", borderRadius: 2, transition: "width 0.3s" }} />
                </div>
              </div>
            )}
            <FileInput label="Upload lyrics (.txt / .lrc)" accept=".txt,.lrc" onFile={f => upload("lyrics", f)} />
            {lines.length > 0 && (<>
              <PBtn onClick={saveLrc}>Save Timestamps</PBtn>
              <PBtnGhost onClick={() => { pushUndo(); setLines(p => p.map(l => ({ ...l, time: -1 }))); setFocus(0); }}>Clear All</PBtnGhost>
            </>)}
          </Panel>
          <Panel title="Cover">
            {coverUrl ? (<>
              <img src={coverUrl} alt="" style={{ width: "100%", borderRadius: SP.sm, marginBottom: SP.sm }} />
              <FileInput label="Replace" accept="image/*" onFile={f => upload("cover", f)} small />
            </>) : (
              <FileInput label="Upload cover image" accept="image/*" onFile={f => upload("cover", f)} />
            )}
          </Panel>
          <Panel title="Export">
            <div style={{ display: "flex", gap: SP.xs, marginBottom: SP.sm, flexWrap: "wrap" }}>
              {([["auto", "Auto"], ["fast", "Fast"], ["record", "Record"], ["advanced", "Exact"]] as const).map(([v, l]) => (
                <button key={v} onClick={() => setRenderMode(v)} style={{
                  flex: 1, minWidth: 50, padding: `${SP.xs}px 0`, borderRadius: SP.xs, border: "none", fontSize: 10, cursor: "pointer",
                  background: renderMode === v ? "#6c5ce7" : "#1a1a28", color: renderMode === v ? "#fff" : "#666",
                }}>{l}</button>
              ))}
            </div>
            <div style={{ fontSize: 10, color: "#555", marginBottom: SP.sm }}>
              {renderMode === "fast" ? "Fast compositing. Some transitions approximated." :
               renderMode === "record" ? "Record preview. Preserves exact appearance." :
               renderMode === "advanced" ? "Frame by frame. Slower but visually exact." :
               "Auto selects the best mode."}
            </div>
            <PBtn onClick={doExport}>Export Video</PBtn>
            <PBtnGhost onClick={saveLrc}>Save Project</PBtnGhost>
          </Panel>
          {tab === "editor" && (
            <div style={{ borderTop: "1px solid #1c1c28", paddingTop: SP.md }}>
              <label style={{ display: "flex", alignItems: "center", gap: SP.sm, fontSize: 12, color: "#888", cursor: "pointer", marginBottom: SP.md }}>
                <input type="checkbox" checked={autoAdvance} onChange={e => setAutoAdvance(e.target.checked)} style={{ accentColor: "#6c5ce7" }} />
                Auto-advance
              </label>
              <PanelLabel>Speed</PanelLabel>
              <div style={{ display: "flex", gap: SP.xs, marginBottom: SP.lg }}>
                {[0.5, 0.75, 1, 1.25, 1.5].map(s => (
                  <button key={s} onClick={() => setSpeed(s)} style={{ flex: 1, padding: `${SP.xs}px 0`, borderRadius: SP.xs, border: "none", background: speed === s ? "#6c5ce7" : "#1a1a28", color: speed === s ? "#fff" : "#666", fontSize: 11, cursor: "pointer" }}>{s}x</button>
                ))}
              </div>
              {stamped > 0 && (<>
                <PanelLabel>Shift All</PanelLabel>
                <div style={{ display: "flex", gap: SP.xs, marginBottom: SP.lg }}>
                  {[-1, -0.5, -0.1, 0.1, 0.5, 1].map(d => (
                    <button key={d} onClick={() => shiftAll(d)} style={{ flex: 1, padding: `${SP.xs}px 0`, borderRadius: SP.xs, border: "1px solid #2a2a3a", background: "transparent", color: "#888", fontSize: 10, cursor: "pointer" }}>{d > 0 ? "+" : ""}{d}</button>
                  ))}
                </div>
              </>)}
              <PanelLabel>Shortcuts</PanelLabel>
              <div style={{ fontSize: 11, color: "#444", lineHeight: 1.7 }}>
                <SK k="Space" d="Play/Pause" /><SK k="Enter" d="Stamp" /><SK k="Up/Down" d="Navigate" />
                <SK k="Left/Right" d="Skip 2s" /><SK k="[ ]" d="Nudge" /><SK k="Tab" d="Next untimed" />
                <SK k="Ctrl+Z" d="Undo" /><SK k="Ctrl+Bksp" d="Clear" />
              </div>
            </div>
          )}
        </div>

        {/* CENTER */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Layout selector + tabs */}
          <div style={{ display: "flex", alignItems: "center", background: "#111118", borderBottom: "1px solid #1c1c28", flexShrink: 0 }}>
            <TabBtn active={tab === "editor"} onClick={() => setTab("editor")}>Timing Editor</TabBtn>
            <TabBtn active={tab === "preview"} onClick={() => setTab("preview")}>Video Preview</TabBtn>
            <div style={{ flex: 1 }} />
            {/* Layout tabs */}
            {layouts && (
              <div style={{ display: "flex", alignItems: "center", gap: SP.xs, marginRight: SP.sm }}>
                {layouts.order.map(id => {
                  const l = layouts.items[id];
                  if (!l) return null;
                  const isActive = layouts.activeId === id;
                  return (
                    <button key={id} onClick={() => switchLayout(id)} style={{
                      padding: `${SP.xs}px ${SP.sm}px`, borderRadius: SP.xs, border: "none", fontSize: 10,
                      background: isActive ? "#6c5ce7" : "#1a1a28", color: isActive ? "#fff" : "#666",
                      cursor: "pointer", whiteSpace: "nowrap",
                    }}>
                      {l.name} {l.aspectRatio}
                    </button>
                  );
                })}
                <button onClick={() => {
                  const ar = prompt("Aspect ratio (16:9, 9:16, 1:1, 4:3):", "9:16");
                  if (ar) addLayout(ar);
                }} style={{
                  padding: `${SP.xs}px ${SP.sm}px`, borderRadius: SP.xs, border: "1px solid #2a2a3a",
                  background: "transparent", color: "#555", cursor: "pointer", fontSize: 10,
                }}>+</button>
              </div>
            )}
          </div>
          <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
            <div style={{ position: "absolute", inset: 0, display: tab === "editor" ? "flex" : "none", flexDirection: "column" }}>
              <div ref={listRef} style={{ flex: 1, overflowY: "auto", padding: `${SP.sm}px ${SP.lg}px` }}>
                {lines.length === 0 ? <Empty text="Upload a lyrics file to start timing" /> : lines.map((line, i) => {
                  const foc = i === focus, act = i === activeLine, has = line.time >= 0;
                  return (
                    <div key={i} onClick={() => {
                      if (playing && audioRef.current) {
                        pushUndo();
                        setLines(p => { const u = [...p]; u[i] = { ...u[i], time: parseFloat(audioRef.current!.currentTime.toFixed(2)) }; return u; });
                        if (autoAdvance) setFocus(Math.min(i + 1, lines.length - 1)); else setFocus(i);
                      } else { setFocus(i); if (has) seekTo(line.time); }
                    }} style={{
                      display: "flex", alignItems: "center", padding: `${SP.sm - 2}px ${SP.sm}px`,
                      borderRadius: 6, marginBottom: 1, cursor: "pointer",
                      background: foc ? "rgba(108,92,231,0.12)" : act ? "rgba(108,92,231,0.06)" : "transparent",
                      borderLeft: foc ? "3px solid #6c5ce7" : "3px solid transparent",
                    }}>
                      <input style={{ width: 72, background: "#0c0c16", border: `1px solid ${has ? "#253025" : "#252525"}`, borderRadius: 4, color: has ? "#6fcf70" : "#444", padding: "3px 4px", fontSize: 11, fontFamily: "monospace", textAlign: "center", outline: "none" }}
                        value={formatTime(line.time)} onChange={e => handleTimeEdit(i, e.target.value)} onClick={e => e.stopPropagation()} />
                      <span style={{ width: 36, fontSize: 9, color: "#3a3a4a", textAlign: "center", margin: `0 ${SP.xs}px`, flexShrink: 0, fontFamily: "monospace" }}>{lineDur(i)}</span>
                      <span style={{ width: 22, fontSize: 10, color: "#2a2a3a", textAlign: "right", marginRight: SP.sm, flexShrink: 0 }}>{i + 1}</span>
                      <span style={{ flex: 1, fontSize: foc ? 14 : 13, color: foc ? "#eee" : act ? "#ccc" : "#777", fontWeight: foc ? 600 : 400 }}>{line.text}</span>
                      {foc && has && (
                        <div style={{ display: "flex", gap: 2, marginRight: SP.sm }}>
                          <NudgeBtn onClick={() => nudge(i, -0.1)}>-</NudgeBtn>
                          <NudgeBtn onClick={() => nudge(i, 0.1)}>+</NudgeBtn>
                        </div>
                      )}
                      <span style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, background: has ? "#4caf50" : "#2a2a2a" }} />
                    </div>
                  );
                })}
              </div>
            </div>
            <div style={{ position: "absolute", inset: 0, display: tab === "preview" ? "flex" : "none", alignItems: "center", justifyContent: "center", background: "#060609" }}>
              {stampedLines.length > 0 ? (
                <LyricVideoPreview project={project} lrcLines={stampedLines} currentTime={time} coverUrl={coverUrl} visualConfig={cfg} />
              ) : (
                <Empty text="Set timestamps in the Timing Editor to preview" />
              )}
            </div>
          </div>
          {/* Audio bar */}
          <div style={{ display: "flex", alignItems: "center", gap: SP.sm, padding: `${SP.sm}px ${SP.xl}px`, background: "#0c0c14", borderTop: "1px solid #1c1c28", flexShrink: 0, minHeight: 54 }}>
            {audioUrl ? (<>
              <audio ref={audioCallbackRef} src={audioUrl} preload="auto" />
              <button onClick={togglePlay} style={{ width: 34, height: 34, borderRadius: "50%", border: "none", background: "#6c5ce7", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>
                {playing ? "\u275A\u275A" : "\u25B6"}
              </button>
              <span style={{ fontFamily: "monospace", fontSize: 12, color: "#888", minWidth: 72 }}>{formatTime(time)}</span>
              <input type="range" min={0} max={project.duration || 100} step={0.01} value={time}
                onChange={onSliderChange} onMouseDown={onSliderDown} onTouchStart={onSliderDown}
                style={{ flex: 1, accentColor: "#6c5ce7", cursor: "pointer", height: 4 }} />
              <span style={{ fontFamily: "monospace", fontSize: 12, color: "#555", minWidth: 72 }}>{formatTime(project.duration || 0)}</span>
              {speed !== 1 && <span style={{ fontSize: 11, color: "#6c5ce7", fontWeight: 600 }}>{speed}x</span>}
            </>) : (
              <span style={{ color: "#444", fontSize: 12 }}>Upload audio to enable playback</span>
            )}
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div style={{ width: 280, minWidth: 240, maxWidth: 320, background: "#111118", borderLeft: "1px solid #1c1c28", flexShrink: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: `${SP.sm}px ${SP.lg}px`, borderBottom: "1px solid #1c1c28", fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 1.2, fontWeight: 600 }}>
            Visual Settings
          </div>
          <div style={{ flex: 1, overflow: "hidden" }}>
            <VisualEditor config={cfg} onChange={onCfgChange} />
          </div>
        </div>
      </div>

      {/* Toasts */}
      <div style={{ position: "fixed", top: SP.lg, right: SP.lg, zIndex: 999, display: "flex", flexDirection: "column", gap: SP.sm }}>
        {toasts.map(t => (
          <div key={t.id} style={{ padding: `${SP.sm}px ${SP.lg}px`, borderRadius: SP.sm, fontSize: 13, maxWidth: 320,
            background: t.type === "ok" ? "#1a3a1a" : t.type === "err" ? "#3a1a1a" : "#1a1a3a",
            color: t.type === "ok" ? "#7ecf7e" : t.type === "err" ? "#cf7e7e" : "#9e9eff",
            border: `1px solid ${t.type === "ok" ? "#2a4a2a" : t.type === "err" ? "#4a2a2a" : "#2a2a4a"}`,
          }}>{t.msg}</div>
        ))}
      </div>
      {busy && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 998, color: "#888", fontSize: 14 }}>{busy}</div>
      )}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><PanelLabel>{title}</PanelLabel>{children}</div>;
}
function PanelLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: 1.2, marginBottom: SP.sm, fontWeight: 600 }}>{children}</div>;
}
function PanelInfo({ text, ok }: { text: string; ok?: boolean }) {
  return <div style={{ fontSize: 12, color: ok ? "#6fcf70" : "#888", marginBottom: SP.sm }}>{text}</div>;
}
function FileInput({ label, accept, onFile, small }: { label: string; accept: string; onFile: (f: File) => void; small?: boolean }) {
  return <label style={{ display: "block", background: "#0c0c16", border: "1px dashed #2a2a3a", borderRadius: SP.sm, padding: small ? SP.sm : `${SP.md}px`, textAlign: "center", cursor: "pointer", color: "#555", fontSize: 12, marginBottom: SP.sm }}>{label}<input type="file" accept={accept} hidden onChange={e => e.target.files?.[0] && onFile(e.target.files[0])} /></label>;
}
function PBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} style={{ width: "100%", padding: `${SP.sm}px`, borderRadius: 6, border: "none", background: "#6c5ce7", color: "#fff", fontSize: 12, fontWeight: 500, cursor: "pointer", marginBottom: SP.sm }}>{children}</button>;
}
function PBtnGhost({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} style={{ width: "100%", padding: "7px", borderRadius: 6, border: "1px solid #2a2a3a", background: "transparent", color: "#888", fontSize: 12, cursor: "pointer", marginBottom: SP.sm }}>{children}</button>;
}
function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} style={{ padding: `${SP.sm}px ${SP.xl}px`, border: "none", background: "none", color: active ? "#fff" : "#666", fontSize: 13, fontWeight: 500, cursor: "pointer", borderBottom: active ? "2px solid #6c5ce7" : "2px solid transparent" }}>{children}</button>;
}
function NudgeBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button onClick={e => { e.stopPropagation(); onClick(); }} style={{ background: "#1a1a28", border: "none", color: "#666", cursor: "pointer", borderRadius: 3, padding: "1px 5px", fontSize: 10 }}>{children}</button>;
}
function Empty({ text }: { text: string }) {
  return <div style={{ textAlign: "center", padding: 40, color: "#444", fontSize: 13 }}>{text}</div>;
}
function SK({ k, d }: { k: string; d: string }) {
  return <div><span style={{ color: "#6c5ce7", fontFamily: "monospace" }}>{k}</span> {d}</div>;
}
