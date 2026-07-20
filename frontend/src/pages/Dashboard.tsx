import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../utils/api";
import type { Project } from "../types";

const styles = {
  container: {
    maxWidth: 960,
    margin: "0 auto",
    padding: "40px 20px",
  } as React.CSSProperties,
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 40,
  } as React.CSSProperties,
  title: {
    fontSize: 32,
    fontWeight: 700,
    color: "#fff",
  } as React.CSSProperties,
  subtitle: {
    fontSize: 14,
    color: "#888",
    marginTop: 4,
  } as React.CSSProperties,
  btn: {
    background: "#6c5ce7",
    color: "#fff",
    border: "none",
    padding: "12px 24px",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
  } as React.CSSProperties,
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: 20,
  } as React.CSSProperties,
  card: {
    background: "#16161e",
    borderRadius: 12,
    padding: 24,
    cursor: "pointer",
    border: "1px solid #2a2a3a",
    transition: "border-color 0.2s",
  } as React.CSSProperties,
  cardTitle: {
    fontSize: 18,
    fontWeight: 600,
    color: "#fff",
    marginBottom: 4,
  } as React.CSSProperties,
  cardArtist: {
    fontSize: 14,
    color: "#888",
    marginBottom: 12,
  } as React.CSSProperties,
  badge: {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 4,
    fontSize: 11,
    marginRight: 6,
  } as React.CSSProperties,
  modal: {
    position: "fixed" as const,
    inset: 0,
    background: "rgba(0,0,0,0.7)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
  } as React.CSSProperties,
  modalContent: {
    background: "#1a1a2e",
    borderRadius: 16,
    padding: 32,
    width: 400,
  } as React.CSSProperties,
  input: {
    width: "100%",
    padding: "10px 14px",
    background: "#0a0a14",
    border: "1px solid #333",
    borderRadius: 8,
    color: "#fff",
    fontSize: 14,
    marginBottom: 16,
    outline: "none",
  } as React.CSSProperties,
  empty: {
    textAlign: "center" as const,
    padding: 60,
    color: "#666",
  } as React.CSSProperties,
};

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", title: "", artist: "" });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    api.listProjects().then(setProjects).catch(console.error);
  }, []);

  const handleCreate = async () => {
    if (!form.name.trim() || !form.title.trim()) return;
    setLoading(true);
    try {
      await api.createProject(
        form.name.trim().replace(/\s+/g, "_"),
        form.title.trim(),
        form.artist.trim()
      );
      setShowCreate(false);
      setForm({ name: "", title: "", artist: "" });
      const updated = await api.listProjects();
      setProjects(updated);
    } catch (e: any) {
      alert(e.message);
    }
    setLoading(false);
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <div style={styles.title}>Lyric Studio</div>
          <div style={styles.subtitle}>
            Create cinematic lyric videos with automatic synchronization
          </div>
        </div>
        <button style={styles.btn} onClick={() => setShowCreate(true)}>
          + New Project
        </button>
      </div>

      {projects.length === 0 ? (
        <div style={styles.empty}>
          <p style={{ fontSize: 18, marginBottom: 8 }}>No projects yet</p>
          <p>Create your first project to get started</p>
        </div>
      ) : (
        <div style={styles.grid}>
          {projects.map((p) => (
            <div
              key={p.name}
              style={styles.card}
              onClick={() => navigate(`/project/${p.name}`)}
              onMouseEnter={(e) =>
                (e.currentTarget.style.borderColor = "#6c5ce7")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.borderColor = "#2a2a3a")
              }
            >
              <div style={styles.cardTitle}>{p.title}</div>
              <div style={styles.cardArtist}>{p.artist || "Unknown artist"}</div>
              <div>
                <span
                  style={{
                    ...styles.badge,
                    background: p.audio_file ? "#2d5a27" : "#3a2020",
                    color: p.audio_file ? "#7ec87e" : "#c87e7e",
                  }}
                >
                  {p.audio_file ? "Audio" : "No audio"}
                </span>
                <span
                  style={{
                    ...styles.badge,
                    background: p.lrc_file ? "#2d5a27" : "#3a2020",
                    color: p.lrc_file ? "#7ec87e" : "#c87e7e",
                  }}
                >
                  {p.lrc_file ? "Synced" : "No sync"}
                </span>
                <span
                  style={{
                    ...styles.badge,
                    background: p.cover_file ? "#2d5a27" : "#3a2020",
                    color: p.cover_file ? "#7ec87e" : "#c87e7e",
                  }}
                >
                  {p.cover_file ? "Cover" : "No cover"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <div style={styles.modal} onClick={() => setShowCreate(false)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ color: "#fff", marginBottom: 24, fontSize: 20 }}>
              New Project
            </h2>
            <label style={{ color: "#aaa", fontSize: 12, display: "block", marginBottom: 4 }}>
              Project ID (no spaces)
            </label>
            <input
              style={styles.input}
              placeholder="my_song"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <label style={{ color: "#aaa", fontSize: 12, display: "block", marginBottom: 4 }}>
              Song Title
            </label>
            <input
              style={styles.input}
              placeholder="My Song Title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
            <label style={{ color: "#aaa", fontSize: 12, display: "block", marginBottom: 4 }}>
              Artist
            </label>
            <input
              style={styles.input}
              placeholder="Artist Name"
              value={form.artist}
              onChange={(e) => setForm({ ...form, artist: e.target.value })}
            />
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 8 }}>
              <button
                style={{ ...styles.btn, background: "#333" }}
                onClick={() => setShowCreate(false)}
              >
                Cancel
              </button>
              <button style={styles.btn} onClick={handleCreate} disabled={loading}>
                {loading ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
