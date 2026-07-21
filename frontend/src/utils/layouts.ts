/**
 * Multi-layout system: presets, migration, and helpers.
 */

import type { Project, ProjectLayouts, SavedLayout, VisualConfig } from "../types";
import { defaultVisualConfig, mergeConfig } from "./visualDefaults";

let _nextId = 0;
function genId(): string {
  return `layout_${Date.now()}_${++_nextId}`;
}

// ─── Portrait 9:16 default ──────────────────────────────────────────
export const portraitDefault: VisualConfig = {
  cover: {
    position: "center",
    offsetX: 0,
    offsetY: -280,
    widthPercent: 45,
    borderRadius: 16,
    shadowIntensity: 0.5,
  },
  lyrics: {
    position: "center",
    offsetX: 0,
    offsetY: 140,
    widthPercent: 80,
    verticalAlign: "top",
    textAlign: "center",
    fontFamily: "Inter, Helvetica Neue, Arial, sans-serif",
    activeFontSize: 34,
    inactiveFontSize: 24,
    lineSpacing: 60,
    letterSpacing: 0,
    activeColor: "#ffffff",
    activeWeight: 600,
    inactiveOpacity: 0.25,
    futureOpacity: 0.4,
    scrollSpeed: 0.35,
    visibleLines: 5,
  },
  title: {
    fontFamily: "Inter, Helvetica Neue, Arial, sans-serif",
    fontSize: 26,
    fontWeight: 600,
    color: "#ffffff",
    opacity: 1,
    position: "below-cover",
    offsetX: 0,
    offsetY: 24,
  },
  artist: {
    fontFamily: "Inter, Helvetica Neue, Arial, sans-serif",
    fontSize: 16,
    fontWeight: 400,
    color: "rgba(255,255,255,0.45)",
    opacity: 1,
    offsetY: 6,
  },
  background: {
    type: "blurred-cover",
    blurAmount: 80,
    brightness: 0.18,
    overlayOpacity: 0.35,
    solidColor: "#0a0a0f",
    gradientFrom: "#1a1a2e",
    gradientTo: "#0a0a0f",
    gradientAngle: 135,
  },
  video: { width: 1080, height: 1920, fps: 30 },
  lyricAnimation: {
    enabled: false,
    activeColor: "#6c5ce7",
    completedColor: "#888888",
    inactiveColor: "#ffffff",
    colorMode: "current-line",
    transitionDuration: 2,
  },
};

// ─── Square 1:1 default ─────────────────────────────────────────────
export const squareDefault: VisualConfig = {
  cover: {
    position: "center",
    offsetX: 0,
    offsetY: -180,
    widthPercent: 35,
    borderRadius: 12,
    shadowIntensity: 0.4,
  },
  lyrics: {
    position: "center",
    offsetX: 0,
    offsetY: 100,
    widthPercent: 80,
    verticalAlign: "top",
    textAlign: "center",
    fontFamily: "Inter, Helvetica Neue, Arial, sans-serif",
    activeFontSize: 28,
    inactiveFontSize: 20,
    lineSpacing: 48,
    letterSpacing: 0,
    activeColor: "#ffffff",
    activeWeight: 600,
    inactiveOpacity: 0.25,
    futureOpacity: 0.4,
    scrollSpeed: 0.35,
    visibleLines: 4,
  },
  title: {
    fontFamily: "Inter, Helvetica Neue, Arial, sans-serif",
    fontSize: 22,
    fontWeight: 600,
    color: "#ffffff",
    opacity: 1,
    position: "below-cover",
    offsetX: 0,
    offsetY: 20,
  },
  artist: {
    fontFamily: "Inter, Helvetica Neue, Arial, sans-serif",
    fontSize: 14,
    fontWeight: 400,
    color: "rgba(255,255,255,0.45)",
    opacity: 1,
    offsetY: 4,
  },
  background: {
    type: "blurred-cover",
    blurAmount: 80,
    brightness: 0.18,
    overlayOpacity: 0.35,
    solidColor: "#0a0a0f",
    gradientFrom: "#1a1a2e",
    gradientTo: "#0a0a0f",
    gradientAngle: 135,
  },
  video: { width: 1080, height: 1080, fps: 30 },
  lyricAnimation: {
    enabled: false,
    activeColor: "#6c5ce7",
    completedColor: "#888888",
    inactiveColor: "#ffffff",
    colorMode: "current-line",
    transitionDuration: 2,
  },
};

// ─── Create default layouts for a new project ───────────────────────
export function createDefaultLayouts(): ProjectLayouts {
  const landscapeId = genId();
  const portraitId = genId();
  return {
    order: [landscapeId, portraitId],
    activeId: landscapeId,
    items: {
      [landscapeId]: {
        id: landscapeId,
        name: "Landscape",
        aspectRatio: "16:9",
        config: { ...defaultVisualConfig },
        createdAt: new Date().toISOString(),
      },
      [portraitId]: {
        id: portraitId,
        name: "Portrait",
        aspectRatio: "9:16",
        config: { ...portraitDefault },
        createdAt: new Date().toISOString(),
      },
    },
  };
}

// ─── Migrate old single-config project to multi-layout ──────────────
export function migrateProjectLayouts(project: Project): ProjectLayouts {
  const existingConfig = project.visual_config
    ? mergeConfig(defaultVisualConfig, project.visual_config)
    : { ...defaultVisualConfig };

  // Infer aspect ratio from existing dimensions
  const w = existingConfig.video?.width ?? 1920;
  const h = existingConfig.video?.height ?? 1080;
  let ar = "16:9";
  if (w < h) ar = "9:16";
  else if (w === h) ar = "1:1";
  else if (Math.abs(w / h - 4 / 3) < 0.05) ar = "4:3";

  const migratedId = genId();
  const portraitId = genId();

  const layouts: ProjectLayouts = {
    order: [migratedId, portraitId],
    activeId: migratedId,
    items: {
      [migratedId]: {
        id: migratedId,
        name: ar === "9:16" ? "Portrait" : ar === "1:1" ? "Square" : "Landscape",
        aspectRatio: ar,
        config: existingConfig,
        createdAt: new Date().toISOString(),
      },
    },
  };

  // Add a portrait layout if the existing one isn't already portrait
  if (ar !== "9:16") {
    layouts.items[portraitId] = {
      id: portraitId,
      name: "Portrait",
      aspectRatio: "9:16",
      config: { ...portraitDefault },
      createdAt: new Date().toISOString(),
    };
  } else {
    // Add landscape instead
    layouts.items[portraitId] = {
      id: portraitId,
      name: "Landscape",
      aspectRatio: "16:9",
      config: { ...defaultVisualConfig },
      createdAt: new Date().toISOString(),
    };
  }

  return layouts;
}

// ─── Get the active layout's config ─────────────────────────────────
export function getActiveConfig(project: Project): VisualConfig {
  if (project.layouts) {
    const active = project.layouts.items[project.layouts.activeId];
    if (active) return mergeConfig(defaultVisualConfig, active.config);
  }
  if (project.visual_config) return mergeConfig(defaultVisualConfig, project.visual_config);
  return { ...defaultVisualConfig };
}

// ─── Create a new layout from a preset ──────────────────────────────
export function createLayout(name: string, aspectRatio: string): SavedLayout {
  const id = genId();
  let config: VisualConfig;
  if (aspectRatio === "9:16") config = { ...portraitDefault };
  else if (aspectRatio === "1:1") config = { ...squareDefault };
  else config = { ...defaultVisualConfig };
  return { id, name, aspectRatio, config, createdAt: new Date().toISOString() };
}

// ─── Duplicate a layout ─────────────────────────────────────────────
export function duplicateLayout(source: SavedLayout, newName?: string): SavedLayout {
  return {
    ...source,
    id: genId(),
    name: newName || `${source.name} Copy`,
    config: JSON.parse(JSON.stringify(source.config)),
    createdAt: new Date().toISOString(),
  };
}
