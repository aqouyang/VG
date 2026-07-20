import React, { useEffect, useState, useRef, useCallback } from "react";
import { api } from "../utils/api";

interface Job {
  id: string; project_name: string; title: string; output_path: string;
  width: number; height: number; fps: number; total_frames: number;
  status: string; stage: string; current_frame: number;
  percent: number; render_fps: number; elapsed: number; eta: number;
  error: string; created: string; seq: number;
}

const STATUS_COLORS: Record<string, string> = {
  queued: "#888", preparing: "#9e9eff", rendering: "#6c5ce7",
  encoding: "#6c5ce7", muxing: "#6c5ce7", completed: "#6fcf70",
  failed: "#cf7e7e", paused: "#f0ad4e", cancelled: "#888", interrupted: "#f0ad4e",
};

function fmtTime(s: number): string {
  if (s <= 0) return "";
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${Math.floor(s % 60)}s` : `${Math.floor(s)}s`;
}

const STORAGE_KEY = "lyric-studio-export-dock";

function loadPos(): { x: number; y: number; collapsed: boolean; hidden: boolean } {
  try {
    const d = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      x: typeof d.x === "number" ? d.x : window.innerWidth - 380,
      y: typeof d.y === "number" ? d.y : window.innerHeight - 260,
      collapsed: !!d.collapsed,
      hidden: !!d.hidden,
    };
  } catch { return { x: window.innerWidth - 380, y: window.innerHeight - 260, collapsed: false, hidden: false }; }
}

function savePos(p: { x: number; y: number; collapsed: boolean; hidden: boolean }) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
}

export default function ExportDock() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [pos, setPos] = useState(loadPos);
  const lastSeqs = useRef<Record<string, number>>({});
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  // Poll
  useEffect(() => {
    const poll = () => {
      api.listJobs().then((data: Job[]) => {
        setJobs(data.map(j => {
          const last = lastSeqs.current[j.id] ?? 0;
          if (j.seq < last) return jobs.find(o => o.id === j.id) ?? j;
          lastSeqs.current[j.id] = j.seq;
          return j;
        }));
      }).catch(() => {});
    };
    poll();
    const id = setInterval(poll, 1500);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save position on change
  useEffect(() => { savePos(pos); }, [pos]);

  // Drag handlers
  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const nx = Math.max(0, Math.min(window.innerWidth - 100, dragRef.current.origX + (ev.clientX - dragRef.current.startX)));
      const ny = Math.max(0, Math.min(window.innerHeight - 40, dragRef.current.origY + (ev.clientY - dragRef.current.startY)));
      setPos(p => ({ ...p, x: nx, y: ny }));
    };
    const onUp = () => { dragRef.current = null; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos.x, pos.y]);

  if (jobs.length === 0 || pos.hidden) return null;

  const active = jobs.filter(j => ["rendering", "encoding", "muxing", "preparing", "queued"].includes(j.status)).length;
  const done = jobs.filter(j => j.status === "completed").length;

  return (
    <div style={{
      position: "fixed", left: pos.x, top: pos.y, zIndex: 950,
      width: 360, background: "#14141e", border: "1px solid #2a2a3a",
      borderRadius: 10, boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
      display: "flex", flexDirection: "column",
      maxHeight: pos.collapsed ? 36 : 240,
      overflow: "hidden", transition: "max-height 0.2s ease",
    }}>
      {/* Title bar (draggable) */}
      <div onMouseDown={onDragStart} style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "6px 12px", cursor: "grab", flexShrink: 0,
        borderBottom: pos.collapsed ? "none" : "1px solid #1c1c28",
        background: "#18182a", borderRadius: "10px 10px 0 0",
        userSelect: "none",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
          <span style={{ color: "#6c5ce7", fontWeight: 600 }}>Exports</span>
          {active > 0 && <span style={{ color: "#9e9eff" }}>{active} active</span>}
          {done > 0 && <span style={{ color: "#6fcf70" }}>{done} done</span>}
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <WinBtn onClick={() => setPos(p => ({ ...p, collapsed: !p.collapsed }))} title={pos.collapsed ? "Expand" : "Collapse"}>
            {pos.collapsed ? "\u25B3" : "\u25BD"}
          </WinBtn>
          <WinBtn onClick={() => setPos(p => ({ ...p, hidden: true }))} title="Close">{"\u2715"}</WinBtn>
        </div>
      </div>

      {/* Jobs */}
      {!pos.collapsed && (
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 10px" }}>
          {jobs.map(job => (
            <div key={job.id} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "6px 0", borderBottom: "1px solid #1a1a28", fontSize: 11,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: "#ddd", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{job.title}</span>
                  <span style={{ color: STATUS_COLORS[job.status] ?? "#888", fontSize: 9, textTransform: "uppercase", fontWeight: 600 }}>{job.status}</span>
                </div>
                <div style={{ color: "#444", fontSize: 10, marginTop: 1 }}>
                  {(job as any).engine === "fast" ? "Fast" : "Adv"} {job.width}x{job.height} {job.fps}fps
                  {job.render_fps > 0 ? ` (${job.render_fps} fps)` : ""}
                  {job.eta > 0 && job.status === "rendering" ? ` ~${fmtTime(job.eta)}` : ""}
                </div>
                {job.error && <div style={{ color: "#cf7e7e", fontSize: 10, marginTop: 1 }}>{job.error}</div>}
              </div>

              {/* Progress */}
              <div style={{ width: 80, flexShrink: 0 }}>
                <div style={{ height: 3, background: "#1a1a28", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: 2, transition: "width 0.5s ease",
                    width: `${job.percent}%`,
                    background: job.status === "failed" ? "#cf7e7e" : job.status === "completed" ? "#6fcf70" : "#6c5ce7",
                  }} />
                </div>
                <div style={{ textAlign: "right", fontSize: 9, color: "#666", marginTop: 1 }}>{job.percent}%</div>
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                {job.status === "rendering" && <SmBtn onClick={() => api.pauseJob(job.id)} title="Pause">||</SmBtn>}
                {(job.status === "paused" || job.status === "interrupted") && <SmBtn onClick={() => api.resumeJob(job.id)} title="Resume">{"\u25B6"}</SmBtn>}
                {job.status === "failed" && <SmBtn onClick={() => api.retryJob(job.id)} title="Retry">{"\u21BB"}</SmBtn>}
                {["queued", "rendering", "encoding"].includes(job.status) && <SmBtn onClick={() => api.cancelJob(job.id)} title="Cancel">{"\u2715"}</SmBtn>}
                {["completed", "failed", "cancelled"].includes(job.status) && <SmBtn onClick={() => api.deleteJob(job.id)} title="Remove">{"\u2715"}</SmBtn>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WinBtn({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button onClick={e => { e.stopPropagation(); onClick(); }} title={title} style={{
      background: "none", border: "none", color: "#555", cursor: "pointer",
      fontSize: 12, padding: "2px 4px", borderRadius: 3,
    }}>{children}</button>
  );
}

function SmBtn({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title} style={{
      background: "#1a1a28", border: "1px solid #2a2a3a", color: "#888",
      cursor: "pointer", borderRadius: 3, padding: "1px 5px", fontSize: 10,
    }}>{children}</button>
  );
}
