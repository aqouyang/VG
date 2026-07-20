import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../utils/api";
import type { Project } from "../types";

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showDelete, setShowDelete] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", title: "", artist: "" });
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    api.listProjects()
      .then(setProjects)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async () => {
    if (!form.title.trim()) return;
    setCreating(true);
    const name = (form.name.trim() || form.title.trim()).replace(/\s+/g, "_").toLowerCase();
    try {
      await api.createProject(name, form.title.trim(), form.artist.trim());
      setShowCreate(false);
      setForm({ name: "", title: "", artist: "" });
      setProjects(await api.listProjects());
    } catch (e: any) {
      alert(e.message);
    }
    setCreating(false);
  };

  const handleDelete = async (name: string) => {
    try {
      await api.deleteProject(name);
      setProjects(await api.listProjects());
    } catch (e: any) { alert(e.message); }
    setShowDelete(null);
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(180deg, #0a0a12 0%, #0e0e18 100%)",
    }}>
      <div style={{ maxWidth: 1060, margin: "0 auto", padding: "48px 24px" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 48 }}>
          <div>
            <div style={{ fontSize: 36, fontWeight: 700, color: "#fff", letterSpacing: -0.5 }}>
              Lyric Studio
            </div>
            <div style={{ fontSize: 14, color: "#666", marginTop: 6 }}>
              Create cinematic lyric videos
            </div>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            style={{
              background: "#6c5ce7", color: "#fff", border: "none",
              padding: "12px 28px", borderRadius: 10, cursor: "pointer",
              fontSize: 14, fontWeight: 600, transition: "transform 0.15s, box-shadow 0.15s",
              boxShadow: "0 4px 20px rgba(108,92,231,0.3)",
            }}
            onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.97)")}
            onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
          >
            + New Project
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 80, color: "#555" }}>
            <div style={{ fontSize: 24, marginBottom: 8, opacity: 0.3 }}>&#9835;</div>
            Loading projects...
          </div>
        ) : projects.length === 0 ? (
          <div style={{
            textAlign: "center", padding: "80px 40px",
            border: "1px dashed #2a2a3a", borderRadius: 16,
            background: "rgba(255,255,255,0.01)",
          }}>
            <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.15 }}>&#9835;</div>
            <div style={{ fontSize: 18, color: "#666", marginBottom: 8 }}>No projects yet</div>
            <div style={{ fontSize: 13, color: "#444", marginBottom: 24 }}>
              Upload your audio, lyrics, and cover art to create a lyric video
            </div>
            <button
              onClick={() => setShowCreate(true)}
              style={{
                background: "#6c5ce7", color: "#fff", border: "none",
                padding: "10px 24px", borderRadius: 8, cursor: "pointer",
                fontSize: 13, fontWeight: 600,
              }}
            >
              Create your first project
            </button>
          </div>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: 16,
          }}>
            {projects.map((p) => (
              <div
                key={p.name}
                style={{
                  background: "#14141e", borderRadius: 14, padding: "20px 24px",
                  cursor: "pointer", border: "1px solid #1e1e2e",
                  transition: "border-color 0.2s, transform 0.15s, box-shadow 0.2s",
                  position: "relative",
                }}
                onClick={() => navigate(`/project/${p.name}`)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "#6c5ce7";
                  e.currentTarget.style.boxShadow = "0 4px 24px rgba(108,92,231,0.1)";
                  e.currentTarget.style.transform = "translateY(-2px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "#1e1e2e";
                  e.currentTarget.style.boxShadow = "none";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                <div style={{ fontSize: 17, fontWeight: 600, color: "#fff", marginBottom: 4 }}>
                  {p.title}
                </div>
                <div style={{ fontSize: 13, color: "#777", marginBottom: 14 }}>
                  {p.artist || "Unknown artist"}
                  {p.duration ? ` \u00B7 ${Math.floor(p.duration / 60)}:${String(Math.floor(p.duration % 60)).padStart(2, "0")}` : ""}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {[
                    { ok: !!p.audio_file, label: "Audio" },
                    { ok: !!p.lrc_file, label: "Synced" },
                    { ok: !!p.cover_file, label: "Cover" },
                  ].map(({ ok, label }) => (
                    <span key={label} style={{
                      display: "inline-block", padding: "2px 10px", borderRadius: 20,
                      fontSize: 11, fontWeight: 500,
                      background: ok ? "rgba(76,175,80,0.12)" : "rgba(255,100,100,0.08)",
                      color: ok ? "#6fcf70" : "#885555",
                    }}>
                      {ok ? "\u2713 " : ""}{label}
                    </span>
                  ))}
                </div>
                {/* Delete button */}
                <button
                  onClick={(e) => { e.stopPropagation(); setShowDelete(p.name); }}
                  style={{
                    position: "absolute", top: 12, right: 12,
                    background: "none", border: "none", color: "#444",
                    cursor: "pointer", fontSize: 16, padding: "4px 8px",
                    borderRadius: 4, transition: "color 0.15s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#e55")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "#444")}
                  title="Delete project"
                >
                  &#x2715;
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
            backdropFilter: "blur(4px)",
          }}
          onClick={() => setShowCreate(false)}
        >
          <div
            style={{
              background: "#16161e", borderRadius: 16, padding: 32, width: 420,
              border: "1px solid #2a2a3a", boxShadow: "0 24px 80px rgba(0,0,0,0.5)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ color: "#fff", marginBottom: 24, fontSize: 20, fontWeight: 600 }}>
              New Project
            </h2>
            {[
              { key: "title", label: "Song Title", placeholder: "My Song", autoFocus: true },
              { key: "artist", label: "Artist", placeholder: "Artist Name" },
              { key: "name", label: "Project ID (optional)", placeholder: "auto-generated from title" },
            ].map(({ key, label, placeholder, autoFocus }) => (
              <div key={key} style={{ marginBottom: 16 }}>
                <label style={{ color: "#888", fontSize: 12, display: "block", marginBottom: 5 }}>
                  {label}
                </label>
                <input
                  autoFocus={autoFocus}
                  style={{
                    width: "100%", padding: "10px 14px", background: "#0c0c16",
                    border: "1px solid #2a2a3a", borderRadius: 8, color: "#fff",
                    fontSize: 14, outline: "none", transition: "border-color 0.2s",
                    boxSizing: "border-box",
                  }}
                  placeholder={placeholder}
                  value={(form as any)[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#6c5ce7")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "#2a2a3a")}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                />
              </div>
            ))}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
              <button
                onClick={() => setShowCreate(false)}
                style={{
                  background: "#2a2a3a", color: "#ccc", border: "none",
                  padding: "10px 20px", borderRadius: 8, cursor: "pointer", fontSize: 13,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !form.title.trim()}
                style={{
                  background: creating ? "#555" : "#6c5ce7", color: "#fff", border: "none",
                  padding: "10px 24px", borderRadius: 8, cursor: creating ? "default" : "pointer",
                  fontSize: 13, fontWeight: 600,
                }}
              >
                {creating ? "Creating..." : "Create Project"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {showDelete && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
            backdropFilter: "blur(4px)",
          }}
          onClick={() => setShowDelete(null)}
        >
          <div
            style={{
              background: "#16161e", borderRadius: 16, padding: 32, width: 380,
              border: "1px solid #2a2a3a",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ color: "#fff", fontSize: 18, marginBottom: 12 }}>Delete Project</h2>
            <p style={{ color: "#888", fontSize: 14, marginBottom: 24 }}>
              Delete <strong style={{ color: "#fff" }}>{showDelete}</strong> and all its files?
              This cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowDelete(null)}
                style={{
                  background: "#2a2a3a", color: "#ccc", border: "none",
                  padding: "10px 20px", borderRadius: 8, cursor: "pointer", fontSize: 13,
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(showDelete)}
                style={{
                  background: "#e53935", color: "#fff", border: "none",
                  padding: "10px 20px", borderRadius: 8, cursor: "pointer",
                  fontSize: 13, fontWeight: 600,
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
