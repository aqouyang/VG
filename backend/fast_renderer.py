"""
Fast Renderer: Pillow static compositor + ASS subtitles + FFmpeg single-pass pipeline.

Produces lyric videos without launching Chromium. Dramatically faster than Remotion
for standard lyric video templates (static background, scrolling lyrics, karaoke coloring).
"""

import hashlib
import json
import math
import os
import re
import subprocess
import sys
import time
from typing import Optional

from PIL import Image, ImageDraw, ImageFilter, ImageFont

from config import PROJECTS_DIR, DATA_DIR

CACHE_DIR = os.path.join(DATA_DIR, "render-cache")


# ── Layout computation (mirrors frontend/src/utils/layout.ts) ────────

def compute_layout(cfg: dict, w: int, h: int) -> dict:
    sx, sy = w / 1920, h / 1080
    s = min(sx, sy)

    cover_cfg = cfg.get("cover", {})
    cover_size = (cover_cfg.get("widthPercent", 22) / 100) * w
    pos = cover_cfg.get("position", "left")
    if pos == "left":
        cx = w * 0.15 - cover_size / 2
    elif pos == "right":
        cx = w * 0.85 - cover_size / 2
    else:
        cx = (w - cover_size) / 2
    cx += cover_cfg.get("offsetX", 0) * sx
    cy = (h - cover_size) / 2 + cover_cfg.get("offsetY", -40) * sy

    lyrics_cfg = cfg.get("lyrics", {})
    lw = (lyrics_cfg.get("widthPercent", 36) / 100) * w
    lpos = lyrics_cfg.get("position", "right")
    if lpos == "left":
        lx = w * 0.05
    elif lpos == "right":
        lx = w - w * 0.05 - lw
    else:
        lx = (w - lw) / 2
    lx += lyrics_cfg.get("offsetX", 0) * sx
    lh = cover_size
    valign = lyrics_cfg.get("verticalAlign", "center")
    if valign == "top":
        ly = h * 0.1
    elif valign == "bottom":
        ly = h - h * 0.1 - lh
    else:
        ly = (h - lh) / 2
    ly += lyrics_cfg.get("offsetY", -40) * sy

    title_cfg = cfg.get("title", {})
    tpos = title_cfg.get("position", "below-cover")
    if tpos == "below-cover":
        tx, ty = cx, cy + cover_size + title_cfg.get("offsetY", 32) * sy
        talign = "left"
    elif tpos == "top-left":
        tx = title_cfg.get("offsetX", 0) * sx + 80 * sx
        ty = title_cfg.get("offsetY", 0) * sy + 50 * sy
        talign = "left"
    elif tpos == "top-right":
        tx = w - title_cfg.get("offsetX", 0) * sx - 80 * sx
        ty = title_cfg.get("offsetY", 0) * sy + 50 * sy
        talign = "right"
    elif tpos == "top-center":
        tx, ty = w / 2, title_cfg.get("offsetY", 0) * sy + 50 * sy
        talign = "center"
    else:
        tx, ty = w / 2, h - 80 * sy + title_cfg.get("offsetY", 0) * sy
        talign = "center"

    return {
        "cover": {"x": cx, "y": cy, "size": cover_size, "radius": cover_cfg.get("borderRadius", 16) * s},
        "lyrics": {"x": lx, "y": ly, "w": lw, "h": lh},
        "title": {"x": tx, "y": ty, "align": talign},
        "scale": s, "sx": sx, "sy": sy,
    }


# ── Cache key ────────────────────────────────────────────────────────

def _file_hash(path: str) -> str:
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()[:12]


def cache_key(project: dict, project_dir: str, cfg: dict, w: int, h: int) -> str:
    parts = [
        _file_hash(os.path.join(project_dir, "assets", project["cover_file"])),
        json.dumps(cfg.get("background", {}), sort_keys=True),
        json.dumps(cfg.get("cover", {}), sort_keys=True),
        json.dumps(cfg.get("title", {}), sort_keys=True),
        json.dumps(cfg.get("artist", {}), sort_keys=True),
        project.get("title", ""), project.get("artist", ""),
        str(w), str(h),
    ]
    return hashlib.md5("|".join(parts).encode()).hexdigest()[:16]


# ── Static frame compositor (Pillow) ─────────────────────────────────

def _parse_color(c: str) -> tuple:
    """Parse CSS color string to RGBA tuple."""
    if c.startswith("#"):
        c = c.lstrip("#")
        if len(c) == 6:
            return (int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16), 255)
        elif len(c) == 8:
            return (int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16), int(c[6:8], 16))
    m = re.match(r"rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)", c)
    if m:
        a = int(float(m.group(4)) * 255) if m.group(4) else 255
        return (int(m.group(1)), int(m.group(2)), int(m.group(3)), a)
    return (255, 255, 255, 255)


def _round_corners(img: Image.Image, radius: int) -> Image.Image:
    if radius <= 0:
        return img
    mask = Image.new("L", img.size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([(0, 0), img.size], radius, fill=255)
    result = Image.new("RGBA", img.size, (0, 0, 0, 0))
    result.paste(img, mask=mask)
    return result


def _get_font(family: str, size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    """Try to load a font. Fall back to default."""
    names = [n.strip() for n in family.split(",")]
    for name in names:
        name_clean = name.strip("'\" ")
        for path in [
            f"/usr/share/fonts/truetype/{name_clean.lower()}/{name_clean}.ttf",
            f"/usr/share/fonts/truetype/dejavu/DejaVuSans{'-Bold' if bold else ''}.ttf",
            f"C:/Windows/Fonts/{name_clean}.ttf",
            f"C:/Windows/Fonts/arial{'bd' if bold else ''}.ttf",
        ]:
            if os.path.exists(path):
                try:
                    return ImageFont.truetype(path, size)
                except Exception:
                    pass
    try:
        return ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", size)
    except Exception:
        return ImageFont.load_default()


def compose_static_frame(project: dict, project_dir: str, cfg: dict, w: int, h: int) -> Image.Image:
    """Build the static background layer with cover, title, and artist."""
    layout = compute_layout(cfg, w, h)
    s = layout["scale"]
    bg_cfg = cfg.get("background", {})
    cover_path = os.path.join(project_dir, "assets", project["cover_file"])

    # Background
    if bg_cfg.get("type") == "blurred-cover":
        cover_img = Image.open(cover_path).convert("RGBA")
        bg = cover_img.resize((w + 160, h + 160), Image.LANCZOS)
        blur_amount = max(1, int(bg_cfg.get("blurAmount", 80) * s))
        bg = bg.filter(ImageFilter.GaussianBlur(blur_amount))
        brightness = bg_cfg.get("brightness", 0.18)
        from PIL import ImageEnhance
        bg = ImageEnhance.Brightness(bg).enhance(brightness)
        canvas = Image.new("RGBA", (w, h))
        canvas.paste(bg, (-80, -80))
    elif bg_cfg.get("type") == "gradient":
        c1 = _parse_color(bg_cfg.get("gradientFrom", "#1a1a2e"))
        c2 = _parse_color(bg_cfg.get("gradientTo", "#0a0a0f"))
        canvas = Image.new("RGBA", (w, h))
        draw = ImageDraw.Draw(canvas)
        for y in range(h):
            r = int(c1[0] + (c2[0] - c1[0]) * y / h)
            g = int(c1[1] + (c2[1] - c1[1]) * y / h)
            b = int(c1[2] + (c2[2] - c1[2]) * y / h)
            draw.line([(0, y), (w, y)], fill=(r, g, b, 255))
    else:
        color = _parse_color(bg_cfg.get("solidColor", "#0a0a0f"))
        canvas = Image.new("RGBA", (w, h), color)

    # Overlay
    overlay_op = bg_cfg.get("overlayOpacity", 0.35)
    if overlay_op > 0:
        overlay = Image.new("RGBA", (w, h), (0, 0, 0, int(overlay_op * 255)))
        canvas = Image.alpha_composite(canvas, overlay)

    # Cover
    cl = layout["cover"]
    cover_raw = Image.open(cover_path).convert("RGBA")
    csize = max(1, int(cl["size"]))
    cover_resized = cover_raw.resize((csize, csize), Image.LANCZOS)
    cover_rounded = _round_corners(cover_resized, int(cl["radius"]))
    # Shadow
    shadow_intensity = cfg.get("cover", {}).get("shadowIntensity", 0.6)
    if shadow_intensity > 0:
        shadow = Image.new("RGBA", (csize + 40, csize + 40), (0, 0, 0, 0))
        sd = ImageDraw.Draw(shadow)
        sd.rounded_rectangle([(20, 20), (csize + 20, csize + 20)], int(cl["radius"]),
                             fill=(0, 0, 0, int(shadow_intensity * 180)))
        shadow = shadow.filter(ImageFilter.GaussianBlur(int(12 * s)))
        canvas.paste(shadow, (int(cl["x"]) - 20, int(cl["y"]) - 10), shadow)
    canvas.paste(cover_rounded, (int(cl["x"]), int(cl["y"])), cover_rounded)

    # Title
    title_cfg = cfg.get("title", {})
    title_size = int(title_cfg.get("fontSize", 28) * s)
    title_font = _get_font(title_cfg.get("fontFamily", "Arial"), title_size,
                           title_cfg.get("fontWeight", 600) >= 600)
    title_color = _parse_color(title_cfg.get("color", "#ffffff"))
    tl = layout["title"]
    draw = ImageDraw.Draw(canvas)
    title_text = project.get("title", "")
    if tl["align"] == "center":
        bbox = draw.textbbox((0, 0), title_text, font=title_font)
        tw = bbox[2] - bbox[0]
        draw.text((tl["x"] - tw / 2, tl["y"]), title_text, fill=title_color, font=title_font)
    elif tl["align"] == "right":
        bbox = draw.textbbox((0, 0), title_text, font=title_font)
        tw = bbox[2] - bbox[0]
        draw.text((tl["x"] - tw, tl["y"]), title_text, fill=title_color, font=title_font)
    else:
        draw.text((tl["x"], tl["y"]), title_text, fill=title_color, font=title_font)

    # Artist
    artist_cfg = cfg.get("artist", {})
    artist_size = int(artist_cfg.get("fontSize", 18) * s)
    artist_font = _get_font(artist_cfg.get("fontFamily", "Arial"), artist_size)
    artist_color = _parse_color(artist_cfg.get("color", "rgba(255,255,255,115)"))
    artist_text = project.get("artist", "")
    artist_y = tl["y"] + title_size * 1.3 + artist_cfg.get("offsetY", 6) * s
    if tl["align"] == "center":
        bbox = draw.textbbox((0, 0), artist_text, font=artist_font)
        aw = bbox[2] - bbox[0]
        draw.text((tl["x"] - aw / 2, artist_y), artist_text, fill=artist_color, font=artist_font)
    elif tl["align"] == "right":
        bbox = draw.textbbox((0, 0), artist_text, font=artist_font)
        aw = bbox[2] - bbox[0]
        draw.text((tl["x"] - aw, artist_y), artist_text, fill=artist_color, font=artist_font)
    else:
        draw.text((tl["x"], artist_y), artist_text, fill=artist_color, font=artist_font)

    return canvas.convert("RGB")


# ── LRC to ASS subtitle compiler ─────────────────────────────────────

def _ass_color(css_color: str) -> str:
    """Convert CSS color to ASS color format &HAABBGGRR."""
    r, g, b, a = _parse_color(css_color)
    return f"&H{255 - a:02X}{b:02X}{g:02X}{r:02X}"


def _ass_time(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = seconds % 60
    return f"{h}:{m:02d}:{s:05.2f}"


def generate_ass(
    lrc_lines: list[dict],
    cfg: dict,
    w: int, h: int,
    duration: float,
) -> str:
    """Generate ASS subtitle file from LRC lines and visual config."""
    layout = compute_layout(cfg, w, h)
    s = layout["scale"]
    lyrics_cfg = cfg.get("lyrics", {})
    anim_cfg = cfg.get("lyricAnimation", {})

    font_family = lyrics_cfg.get("fontFamily", "Arial").split(",")[0].strip("'\" ")
    active_size = int(lyrics_cfg.get("activeFontSize", 32) * s)
    inactive_size = int(lyrics_cfg.get("inactiveFontSize", 24) * s)
    line_spacing = int(lyrics_cfg.get("lineSpacing", 56) * s)
    visible_lines = lyrics_cfg.get("visibleLines", 5)
    active_color = _ass_color(lyrics_cfg.get("activeColor", "#ffffff"))
    inactive_opacity = lyrics_cfg.get("inactiveOpacity", 0.25)
    future_opacity = lyrics_cfg.get("futureOpacity", 0.4)
    text_align = lyrics_cfg.get("textAlign", "left")

    anim_enabled = anim_cfg.get("enabled", False)
    anim_active = _ass_color(anim_cfg.get("activeColor", "#6c5ce7"))
    anim_completed = _ass_color(anim_cfg.get("completedColor", "#888888"))
    anim_inactive = _ass_color(anim_cfg.get("inactiveColor", "#ffffff"))
    color_mode = anim_cfg.get("colorMode", "current-line")

    # ASS alignment: 1=left, 2=center, 3=right (bottom row)
    # 7=left, 8=center, 9=right (top row)
    # Use middle row: 4=left, 5=center, 6=right
    alignment = {"left": 7, "center": 8, "right": 9}.get(text_align, 7)

    # Lyrics area
    lx = int(layout["lyrics"]["x"])
    ly = int(layout["lyrics"]["y"])
    lw = int(layout["lyrics"]["w"])
    lh = int(layout["lyrics"]["h"])
    center_y = ly + lh // 2

    # Compute end times
    for i, line in enumerate(lrc_lines):
        if i + 1 < len(lrc_lines):
            line["end"] = lrc_lines[i + 1]["time"]
        else:
            line["end"] = max(line["time"] + 5, duration)

    # Build ASS
    lines_out = []
    lines_out.append("[Script Info]")
    lines_out.append("ScriptType: v4.00+")
    lines_out.append(f"PlayResX: {w}")
    lines_out.append(f"PlayResY: {h}")
    lines_out.append("WrapStyle: 0")
    lines_out.append("")
    lines_out.append("[V4+ Styles]")
    lines_out.append("Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding")

    # Active style
    lines_out.append(f"Style: Active,{font_family},{active_size},{active_color},&H00000000,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,0,0,{alignment},{lx},{w - lx - lw},0,1")
    # Inactive (past) style
    past_alpha = int((1 - inactive_opacity) * 255)
    past_color = anim_completed if anim_enabled and color_mode == "all-played" else f"&H{past_alpha:02X}FFFFFF"
    lines_out.append(f"Style: Past,{font_family},{inactive_size},{past_color},&H00000000,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,{alignment},{lx},{w - lx - lw},0,1")
    # Future style
    future_alpha = int((1 - future_opacity) * 255)
    lines_out.append(f"Style: Future,{font_family},{inactive_size},&H{future_alpha:02X}FFFFFF,&H00000000,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,{alignment},{lx},{w - lx - lw},0,1")

    lines_out.append("")
    lines_out.append("[Events]")
    lines_out.append("Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text")

    for active_idx in range(len(lrc_lines)):
        active = lrc_lines[active_idx]
        start = active["time"]
        end = active["end"]

        # Show nearby lines
        for offset in range(-visible_lines, visible_lines + 1):
            idx = active_idx + offset
            if idx < 0 or idx >= len(lrc_lines):
                continue

            line = lrc_lines[idx]
            y_pos = center_y + offset * line_spacing - inactive_size // 2

            if y_pos < ly - line_spacing or y_pos > ly + lh + line_spacing:
                continue

            text = line["text"].replace("\\", "\\\\").replace("{", "\\{").replace("}", "\\}")

            if offset == 0:
                # Active line with karaoke coloring
                if anim_enabled:
                    line_dur = end - start
                    char_count = max(1, len(text))
                    # Karaoke: distribute duration across characters
                    per_char_cs = max(1, int(line_dur * 100 / char_count))
                    karaoke_tags = ""
                    for ch in text:
                        karaoke_tags += f"{{\\kf{per_char_cs}}}{ch}"
                    entry = f"Dialogue: 1,{_ass_time(start)},{_ass_time(end)},Active,,0,0,0,,{{\\pos({lx},{y_pos})\\1c{anim_inactive}\\2c{anim_active}}}{karaoke_tags}"
                else:
                    entry = f"Dialogue: 1,{_ass_time(start)},{_ass_time(end)},Active,,0,0,0,,{{\\pos({lx},{y_pos})}}{text}"
            elif offset < 0:
                entry = f"Dialogue: 0,{_ass_time(start)},{_ass_time(end)},Past,,0,0,0,,{{\\pos({lx},{y_pos})}}{text}"
            else:
                entry = f"Dialogue: 0,{_ass_time(start)},{_ass_time(end)},Future,,0,0,0,,{{\\pos({lx},{y_pos})}}{text}"

            lines_out.append(entry)

    return "\n".join(lines_out)


# ── Capability check ─────────────────────────────────────────────────

def check_fast_compatible(cfg: dict) -> tuple[bool, list[str]]:
    """Check if the visual config is compatible with Fast Renderer."""
    unsupported = []
    # Fast renderer supports all current built-in features
    # If custom animations or 3D effects are added, they would be flagged here
    return (len(unsupported) == 0, unsupported)


# ── FFmpeg pipeline ──────────────────────────────────────────────────

def _select_encoder(settings: dict) -> list[str]:
    """Return FFmpeg encoder args based on settings."""
    enc = settings.get("encoder", "auto")
    preset = settings.get("preset", "balanced")
    crf = settings.get("crf", 23)

    preset_map = {"fast": "fast", "balanced": "medium", "quality": "slow"}
    x264_preset = preset_map.get(preset, "medium")

    if enc == "auto" or enc == "libx264":
        return ["-c:v", "libx264", "-preset", x264_preset, "-crf", str(crf)]
    elif enc == "h264_nvenc":
        nv_preset = {"fast": "fast", "balanced": "medium", "quality": "slow"}.get(preset, "medium")
        return ["-c:v", "h264_nvenc", "-preset", nv_preset, "-cq", str(crf)]
    elif enc == "hevc_nvenc":
        return ["-c:v", "hevc_nvenc", "-preset", "medium", "-cq", str(crf)]
    elif enc == "h264_qsv":
        return ["-c:v", "h264_qsv", "-global_quality", str(crf)]
    elif enc == "h264_amf":
        return ["-c:v", "h264_amf", "-quality", "balanced"]
    elif enc == "libx265":
        return ["-c:v", "libx265", "-preset", x264_preset, "-crf", str(crf)]
    return ["-c:v", "libx264", "-preset", x264_preset, "-crf", str(crf)]


def render_fast(
    project_name: str,
    output_path: str,
    settings: dict,
    on_progress=None,
) -> dict:
    """
    Fast render pipeline:
    1. Compose static frame (Pillow)
    2. Generate ASS subtitles
    3. Single FFmpeg pass: loop image + ASS + audio -> MP4
    """
    project_dir = os.path.join(PROJECTS_DIR, project_name)
    with open(os.path.join(project_dir, "project.json")) as f:
        project = json.load(f)

    cfg = project.get("visual_config", {})
    vc = cfg.get("video", {})
    w = vc.get("width", 1920)
    h = vc.get("height", 1080)
    fps = vc.get("fps", 30)

    import soundfile as sf
    audio_path = os.path.join(project_dir, "audio", project["audio_file"])
    info = sf.info(audio_path)
    duration = float(info.duration)

    # Parse LRC
    lrc_path = os.path.join(project_dir, "lyrics", "lyrics.lrc")
    lrc_lines = []
    with open(lrc_path, encoding="utf-8") as f:
        for line in f.read().strip().split("\n"):
            m = re.match(r"^\[(\d{1,2}):(\d{2}(?:\.\d+)?)\](.+)$", line)
            if m:
                lrc_lines.append({
                    "time": int(m.group(1)) * 60 + float(m.group(2)),
                    "text": m.group(3),
                })

    if not lrc_lines:
        raise ValueError("No lyric lines found")

    # Cache key
    ck = cache_key(project, project_dir, cfg, w, h)
    cache_path = os.path.join(CACHE_DIR, ck)
    os.makedirs(cache_path, exist_ok=True)

    base_frame_path = os.path.join(cache_path, "base-frame.png")
    ass_path = os.path.join(cache_path, "lyrics.ass")

    t0 = time.time()

    # Stage 1: Static frame
    if on_progress:
        on_progress("compositing", 5, 0)

    if not os.path.exists(base_frame_path):
        frame = compose_static_frame(project, project_dir, cfg, w, h)
        frame.save(base_frame_path, "PNG")

    t_compose = time.time() - t0
    if on_progress:
        on_progress("compositing", 12, 0)

    # Stage 2: ASS subtitles
    if on_progress:
        on_progress("subtitles", 15, 0)

    ass_content = generate_ass(lrc_lines, cfg, w, h, duration)
    with open(ass_path, "w", encoding="utf-8") as f:
        f.write(ass_content)

    t_ass = time.time() - t0 - t_compose
    if on_progress:
        on_progress("subtitles", 18, 0)

    # Stage 3: FFmpeg encode
    if on_progress:
        on_progress("encoding", 20, 0)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    from ffmpeg_resolver import get_ffmpeg
    ffmpeg_exe = get_ffmpeg()
    encoder_args = _select_encoder(settings)

    progress_pipe = os.path.join(cache_path, "progress.txt")

    # FFmpeg filter path escaping.
    # In FFmpeg filter syntax, these characters are special and must
    # be backslash-escaped: \ : [ ] ; ,
    # ALL colons must be escaped, including the Windows drive letter.
    # FFmpeg unescapes \: back to : when opening the file.
    ass_for_filter = ass_path.replace("\\", "/")
    ass_for_filter = ass_for_filter.replace(":", "\\:")

    vf = f"subtitles={ass_for_filter},format=yuv420p"

    cmd = [
        ffmpeg_exe, "-y",
        "-loop", "1", "-framerate", str(fps), "-i", base_frame_path,
        "-i", audio_path,
        "-vf", vf,
        "-t", str(duration),
        *encoder_args,
        "-c:a", "aac", "-b:a", settings.get("audioBitrate", "192k"),
        "-shortest",
        "-progress", progress_pipe,
        output_path,
    ]

    t_enc_start = time.time()
    ffmpeg_output_lines = []
    # Do NOT use shell=True. FFmpeg is a real executable, not a batch
    # script. shell=True causes cmd.exe to mangle backslash escapes
    # in the filter string (e.g. \: becomes just :).
    proc = subprocess.Popen(
        cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, bufsize=1,
    )

    # Parse progress from the progress file, collect output for error reporting
    last_pct = 20
    while proc.poll() is None:
        time.sleep(0.5)
        # Read any stdout/stderr
        if proc.stdout:
            import select
            try:
                while True:
                    line = proc.stdout.readline()
                    if not line:
                        break
                    ffmpeg_output_lines.append(line.rstrip())
                    if len(ffmpeg_output_lines) > 100:
                        ffmpeg_output_lines = ffmpeg_output_lines[-50:]
            except Exception:
                pass

        if os.path.exists(progress_pipe):
            try:
                with open(progress_pipe) as pf:
                    content = pf.read()
                m = re.findall(r"out_time_ms=(\d+)", content)
                if m:
                    encoded_us = int(m[-1])
                    encoded_s = encoded_us / 1_000_000
                    pct = min(93, 20 + int(encoded_s / duration * 73))
                    if pct > last_pct:
                        last_pct = pct
                        speed_m = re.findall(r"speed=\s*([\d.]+)x", content)
                        spd = float(speed_m[-1]) if speed_m else 0
                        if on_progress:
                            on_progress("encoding", pct, spd)
            except Exception:
                pass

    # Collect remaining output
    if proc.stdout:
        for line in proc.stdout:
            ffmpeg_output_lines.append(line.rstrip())

    proc.wait()
    t_encode = time.time() - t_enc_start

    # Cleanup progress file
    if os.path.exists(progress_pipe):
        os.remove(progress_pipe)

    if proc.returncode != 0:
        # Build detailed error message from FFmpeg output
        error_lines = [l for l in ffmpeg_output_lines if l.strip()]
        # Find the most relevant error lines
        relevant = [l for l in error_lines if any(k in l.lower() for k in ["error", "fail", "no such", "invalid", "cannot", "unrecognized"])]
        if not relevant:
            relevant = error_lines[-10:] if error_lines else ["No output captured"]
        detail = "\n".join(relevant[-5:])
        raise RuntimeError(f"FFmpeg failed (exit {proc.returncode}):\n{detail}")

    if on_progress:
        on_progress("finalizing", 98, 0)

    # Validate output
    if not os.path.exists(output_path):
        raise RuntimeError("Output file not created")

    total_time = time.time() - t0

    return {
        "engine": "fast",
        "total_time": round(total_time, 2),
        "compose_time": round(t_compose, 2),
        "ass_time": round(t_ass, 2),
        "encode_time": round(t_encode, 2),
        "output_path": output_path,
        "output_size": os.path.getsize(output_path),
        "duration": duration,
        "resolution": f"{w}x{h}",
        "fps": fps,
        "encoder": encoder_args[1] if len(encoder_args) > 1 else "unknown",
    }
