import type { VisualConfig, Theme } from "../types";

const BASE = "/api";

async function request(path: string, options?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Request failed");
  }
  return res.json();
}

export const api = {
  listProjects: () => request("/projects"),

  createProject: (name: string, title: string, artist: string) =>
    request("/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, title, artist }),
    }),

  getProject: (name: string) => request(`/projects/${name}`),

  deleteProject: (name: string) =>
    request(`/projects/${name}`, { method: "DELETE" }),

  updateProject: (name: string, data: { title?: string; artist?: string; visual_config?: VisualConfig }) =>
    request(`/projects/${name}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  uploadAudio: (name: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return request(`/projects/${name}/audio`, { method: "POST", body: fd });
  },

  uploadLyrics: (name: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return request(`/projects/${name}/lyrics`, { method: "POST", body: fd });
  },

  saveLyricsText: (name: string, content: string) => {
    const fd = new FormData();
    fd.append("content", content);
    return request(`/projects/${name}/lyrics/text`, { method: "POST", body: fd });
  },

  getLyricsText: (name: string) => request(`/projects/${name}/lyrics/text`),

  uploadCover: (name: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return request(`/projects/${name}/cover`, { method: "POST", body: fd });
  },

  alignLyrics: (name: string) =>
    request(`/alignment/${name}/align`, { method: "POST" }),

  getLrc: (name: string) => request(`/projects/${name}/lrc`),

  saveLrc: (name: string, content: string) => {
    const fd = new FormData();
    fd.append("content", content);
    return request(`/projects/${name}/lrc`, { method: "POST", body: fd });
  },

  analyzeWaveform: (name: string) =>
    request(`/waveform/${name}/analyze`, { method: "POST" }),

  getWaveformData: (name: string) => request(`/waveform/${name}/data`),

  // Themes
  listThemes: (): Promise<Theme[]> => request("/themes"),

  getTheme: (name: string): Promise<Theme> => request(`/themes/${name}`),

  saveTheme: (name: string, label: string, config: VisualConfig) =>
    request("/themes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, label, config }),
    }),

  deleteTheme: (name: string) =>
    request(`/themes/${name}`, { method: "DELETE" }),
};
