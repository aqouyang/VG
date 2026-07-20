import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../utils/api";

interface GpuInfo {
  name: string;
  vram_mb: number;
  driver: string;
}

interface GpuData {
  gpus: GpuInfo[];
  nvidia: GpuInfo | null;
  encoders: Record<string, boolean>;
}

const SP = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };

export default function Settings() {
  const nav = useNavigate();
  const [gpu, setGpu] = useState<GpuData | null>(null);
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.detectGpu().then(setGpu),
      api.getExportSettings().then(setSettings),
    ]).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    await api.saveExportSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const set = (key: string, val: any) => {
    setSettings(s => ({ ...s, [key]: val }));
    setSaved(false);
  };

  const availableEncoders = gpu?.encoders ?? {};
  const encoderOptions: { v: string; l: string }[] = [
    { v: "auto", l: "Auto (best available)" },
    ...(availableEncoders.libx264 ? [{ v: "libx264", l: "Software H.264 (libx264)" }] : []),
    ...(availableEncoders.libx265 ? [{ v: "libx265", l: "Software HEVC (libx265)" }] : []),
    ...(availableEncoders.h264_nvenc ? [{ v: "h264_nvenc", l: "NVIDIA NVENC H.264" }] : []),
    ...(availableEncoders.hevc_nvenc ? [{ v: "hevc_nvenc", l: "NVIDIA NVENC HEVC" }] : []),
    ...(availableEncoders.h264_qsv ? [{ v: "h264_qsv", l: "Intel Quick Sync H.264" }] : []),
    ...(availableEncoders.hevc_qsv ? [{ v: "hevc_qsv", l: "Intel Quick Sync HEVC" }] : []),
    ...(availableEncoders.h264_amf ? [{ v: "h264_amf", l: "AMD AMF H.264" }] : []),
    ...(availableEncoders.hevc_amf ? [{ v: "hevc_amf", l: "AMD AMF HEVC" }] : []),
  ];

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#0a0a0f", color: "#555" }}>
      Detecting hardware...
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0f", color: "#ccc" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: `${SP.xl}px ${SP.xl}px 80px` }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: SP.lg, marginBottom: SP.xl * 2 }}>
          <button onClick={() => nav("/")} style={{ background: "none", border: "none", color: "#777", cursor: "pointer", fontSize: 14 }}>
            &larr; Back
          </button>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#fff", margin: 0 }}>Performance &amp; GPU</h1>
        </div>

        {/* GPU Detection */}
        <Panel title="Detected Hardware">
          {gpu && gpu.gpus.length > 0 ? (
            gpu.gpus.map((g, i) => (
              <div key={i} style={{ padding: SP.md, background: "#0c0c16", borderRadius: 8, marginBottom: SP.sm, border: "1px solid #1c1c28" }}>
                <div style={{ color: "#eee", fontWeight: 600, fontSize: 14, marginBottom: SP.xs }}>{g.name}</div>
                <div style={{ display: "flex", gap: SP.lg, fontSize: 12, color: "#888" }}>
                  {g.vram_mb > 0 && <span>VRAM: {g.vram_mb > 1024 ? `${(g.vram_mb / 1024).toFixed(1)} GB` : `${g.vram_mb} MB`}</span>}
                  {g.driver && <span>Driver: {g.driver}</span>}
                </div>
              </div>
            ))
          ) : (
            <div style={{ color: "#555", fontSize: 13 }}>No GPUs detected</div>
          )}
          {gpu?.nvidia && (
            <div style={{ padding: SP.md, background: "#0f1a0f", borderRadius: 8, border: "1px solid #1a3a1a", marginBottom: SP.sm }}>
              <div style={{ color: "#6fcf70", fontWeight: 600, fontSize: 13, marginBottom: SP.xs }}>NVIDIA (nvidia-smi)</div>
              <div style={{ fontSize: 12, color: "#888" }}>
                {gpu.nvidia.name} &middot; {gpu.nvidia.vram_mb > 1024 ? `${(gpu.nvidia.vram_mb / 1024).toFixed(1)} GB` : `${gpu.nvidia.vram_mb} MB`} &middot; Driver {gpu.nvidia.driver}
              </div>
            </div>
          )}
        </Panel>

        {/* Available Encoders */}
        <Panel title="Available Encoders">
          <div style={{ display: "flex", flexWrap: "wrap", gap: SP.sm }}>
            {Object.entries(availableEncoders).map(([name, ok]) => (
              <span key={name} style={{
                padding: `${SP.xs}px ${SP.md}px`, borderRadius: 20, fontSize: 12, fontWeight: 500,
                background: ok ? "rgba(76,175,80,0.12)" : "rgba(255,100,100,0.08)",
                color: ok ? "#6fcf70" : "#664444",
                border: `1px solid ${ok ? "#2a4a2a" : "#2a2020"}`,
              }}>
                {name} {ok ? "\u2713" : "\u2717"}
              </span>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "#555", marginTop: SP.md }}>
            GPU hardware encoding accelerates the encoding stage. Chromium frame rendering still uses CPU.
          </div>
        </Panel>

        {/* Encoder Selection */}
        <Panel title="Video Encoder">
          <Row label="Encoder">
            <select value={settings.encoder ?? "auto"} onChange={e => set("encoder", e.target.value)} style={selectStyle}>
              {encoderOptions.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
          </Row>
          <Row label="Preset">
            <select value={settings.preset ?? "balanced"} onChange={e => set("preset", e.target.value)} style={selectStyle}>
              <option value="fast">Fast</option>
              <option value="balanced">Balanced</option>
              <option value="quality">Quality</option>
            </select>
          </Row>
          <Row label="Video Bitrate">
            <input type="text" value={settings.bitrate ?? "8M"} onChange={e => set("bitrate", e.target.value)} style={inputStyle} />
          </Row>
          <Row label="CRF (quality)">
            <input type="number" value={settings.crf ?? 23} min={0} max={51} onChange={e => set("crf", parseInt(e.target.value) || 23)} style={{ ...inputStyle, width: 80 }} />
            <span style={{ fontSize: 11, color: "#555" }}>Lower = better quality, larger file</span>
          </Row>
          <Row label="Audio Bitrate">
            <input type="text" value={settings.audioBitrate ?? "192k"} onChange={e => set("audioBitrate", e.target.value)} style={inputStyle} />
          </Row>
        </Panel>

        {/* Performance */}
        <Panel title="Performance">
          <Row label="Simultaneous exports">
            <input type="number" value={settings.concurrency ?? 1} min={1} max={4} onChange={e => set("concurrency", parseInt(e.target.value) || 1)} style={{ ...inputStyle, width: 80 }} />
          </Row>
          <Row label="Render concurrency">
            <input type="number" value={settings.remotionConcurrency ?? 0} min={0} max={64} onChange={e => set("remotionConcurrency", parseInt(e.target.value) || 0)} style={{ ...inputStyle, width: 80 }} />
            <span style={{ fontSize: 11, color: "#555" }}>0 = auto (all cores)</span>
          </Row>
          <Row label="Chunk size (frames)">
            <input type="number" value={settings.chunkSize ?? 600} min={100} max={3000} step={100} onChange={e => set("chunkSize", parseInt(e.target.value) || 600)} style={{ ...inputStyle, width: 100 }} />
          </Row>
        </Panel>

        {/* Save */}
        <div style={{ display: "flex", gap: SP.md, alignItems: "center", marginTop: SP.xl }}>
          <button onClick={save} style={{
            background: "#6c5ce7", color: "#fff", border: "none",
            padding: `${SP.sm}px ${SP.xl}px`, borderRadius: 8,
            cursor: "pointer", fontSize: 14, fontWeight: 600,
          }}>
            Save Settings
          </button>
          {saved && <span style={{ color: "#6fcf70", fontSize: 13 }}>Saved</span>}
        </div>
      </div>
    </div>
  );
}

// ─── Small components ─────────────────────────────────────────────

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: SP.xl * 1.5 }}>
      <div style={{ fontSize: 11, color: "#6c5ce7", textTransform: "uppercase", letterSpacing: 1.2, fontWeight: 600, marginBottom: SP.md }}>{title}</div>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: SP.md, marginBottom: SP.md }}>
      <span style={{ width: 160, fontSize: 13, color: "#888", flexShrink: 0 }}>{label}</span>
      {children}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  flex: 1, background: "#0c0c16", border: "1px solid #2a2a3a",
  borderRadius: 6, color: "#ddd", padding: "8px 12px", fontSize: 13, outline: "none",
};

const inputStyle: React.CSSProperties = {
  background: "#0c0c16", border: "1px solid #2a2a3a",
  borderRadius: 6, color: "#ddd", padding: "8px 12px", fontSize: 13, outline: "none",
  width: 140,
};
