import React, { useEffect, useState, useRef } from "react";
import { api } from "../utils/api";

interface Job {
  id: string;
  project_name: string;
  title: string;
  output_path: string;
  width: number;
  height: number;
  fps: number;
  total_frames: number;
  status: string;
  stage: string;
  current_frame: number;
  percent: number;
  stage_percent: number;
  render_fps: number;
  elapsed: number;
  eta: number;
  error: string;
  completed_chunks: number;
  chunks: { start: number; end: number; status: string }[];
  created: string;
  finished: string;
  seq: number;
}

const SP = { xs: 4, sm: 8, md: 12, lg: 16 };

const STATUS_COLORS: Record<string, string> = {
  queued: "#888",
  preparing: "#9e9eff",
  rendering: "#6c5ce7",
  encoding: "#6c5ce7",
  muxing: "#6c5ce7",
  completed: "#6fcf70",
  failed: "#cf7e7e",
  paused: "#f0ad4e",
  cancelled: "#888",
  interrupted: "#f0ad4e",
};

function fmtTime(s: number): string {
  if (s <= 0) return "";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

export default function ExportDock() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [expanded, setExpanded] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval>>();
  const lastSeqs = useRef<Record<string, number>>({});

  // Poll jobs every 1.5s
  useEffect(() => {
    const poll = () => {
      api.listJobs().then((data: Job[]) => {
        // Monotonic progress enforcement: never let percent decrease
        const filtered = data.map((j: Job) => {
          const lastSeq = lastSeqs.current[j.id] ?? 0;
          if (j.seq < lastSeq) return jobs.find(old => old.id === j.id) ?? j;
          lastSeqs.current[j.id] = j.seq;
          return j;
        });
        setJobs(filtered);
      }).catch(() => {});
    };
    poll();
    pollRef.current = setInterval(poll, 1500);
    return () => clearInterval(pollRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (jobs.length === 0) return null;

  const active = jobs.filter(j => ["rendering", "encoding", "muxing", "preparing", "queued"].includes(j.status));
  const completed = jobs.filter(j => j.status === "completed");

  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 900,
      background: "#111118", borderTop: "1px solid #1c1c28",
      transition: "height 0.2s ease",
      height: expanded ? Math.min(280, 56 + jobs.length * 52) : 36,
      display: "flex", flexDirection: "column",
    }}>
      {/* Header bar */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: `${SP.sm}px ${SP.lg}px`, cursor: "pointer",
          borderBottom: expanded ? "1px solid #1c1c28" : "none",
          flexShrink: 0, minHeight: 36,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: SP.md, fontSize: 12 }}>
          <span style={{ color: "#6c5ce7", fontWeight: 600 }}>Exports</span>
          {active.length > 0 && <span style={{ color: "#9e9eff" }}>{active.length} active</span>}
          {completed.length > 0 && <span style={{ color: "#6fcf70" }}>{completed.length} done</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: SP.sm }}>
          {active.length > 0 && (
            <button onClick={e => { e.stopPropagation(); jobs.filter(j => j.status === "rendering").forEach(j => api.pauseJob(j.id)); }}
              style={{ background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: 11 }}>Pause all</button>
          )}
          {completed.length > 0 && (
            <button onClick={e => { e.stopPropagation(); completed.forEach(j => api.deleteJob(j.id)); }}
              style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 11 }}>Clear done</button>
          )}
          <span style={{ color: "#555", fontSize: 14 }}>{expanded ? "\u25BE" : "\u25B4"}</span>
        </div>
      </div>

      {/* Job list */}
      {expanded && (
        <div style={{ flex: 1, overflowY: "auto", padding: `${SP.xs}px ${SP.lg}px` }}>
          {jobs.map(job => (
            <div key={job.id} style={{
              display: "flex", alignItems: "center", gap: SP.md,
              padding: `${SP.sm}px 0`, borderBottom: "1px solid #1a1a28",
              fontSize: 12,
            }}>
              {/* Title + status */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: SP.sm }}>
                  <span style={{ color: "#ddd", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {job.title}
                  </span>
                  <span style={{
                    color: STATUS_COLORS[job.status] ?? "#888",
                    fontSize: 10, textTransform: "uppercase", fontWeight: 600,
                  }}>
                    {job.status}
                  </span>
                </div>
                {/* Details row */}
                <div style={{ display: "flex", gap: SP.md, color: "#555", fontSize: 11, marginTop: 2 }}>
                  <span>{job.width}x{job.height}</span>
                  <span>{job.fps}fps</span>
                  {job.render_fps > 0 && <span>{job.render_fps} fps render</span>}
                  {job.elapsed > 0 && <span>{fmtTime(job.elapsed)}</span>}
                  {job.eta > 0 && job.status === "rendering" && <span>~{fmtTime(job.eta)} left</span>}
                </div>
                {job.error && <div style={{ color: "#cf7e7e", fontSize: 11, marginTop: 2 }}>{job.error}</div>}
              </div>

              {/* Progress bar */}
              <div style={{ width: 160, flexShrink: 0 }}>
                <div style={{ height: 4, background: "#1a1a28", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: 2,
                    width: `${job.percent}%`,
                    background: job.status === "failed" ? "#cf7e7e" : job.status === "completed" ? "#6fcf70" : "#6c5ce7",
                    transition: "width 0.5s ease",
                  }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2, fontSize: 10, color: "#555" }}>
                  <span>{job.current_frame}/{job.total_frames}</span>
                  <span style={{ color: "#888", fontWeight: 600 }}>{job.percent}%</span>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: SP.xs, flexShrink: 0 }}>
                {job.status === "rendering" && (
                  <ActionBtn onClick={() => api.pauseJob(job.id)} title="Pause">||</ActionBtn>
                )}
                {(job.status === "paused" || job.status === "interrupted") && (
                  <ActionBtn onClick={() => api.resumeJob(job.id)} title="Resume">{"\u25B6"}</ActionBtn>
                )}
                {job.status === "failed" && (
                  <ActionBtn onClick={() => api.retryJob(job.id)} title="Retry">{"\u21BB"}</ActionBtn>
                )}
                {["queued", "rendering", "encoding"].includes(job.status) && (
                  <ActionBtn onClick={() => api.cancelJob(job.id)} title="Cancel">{"\u2715"}</ActionBtn>
                )}
                {["completed", "failed", "cancelled"].includes(job.status) && (
                  <ActionBtn onClick={() => api.deleteJob(job.id)} title="Remove">{"\u2715"}</ActionBtn>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ActionBtn({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title} style={{
      background: "#1a1a28", border: "1px solid #2a2a3a", color: "#888",
      cursor: "pointer", borderRadius: 4, padding: "2px 6px", fontSize: 11,
    }}>
      {children}
    </button>
  );
}
