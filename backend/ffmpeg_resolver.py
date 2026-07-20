"""
Central FFmpeg resolver. Single source of truth for FFmpeg/FFprobe paths,
version, capabilities, and installation.

Used by: CLI startup, export jobs, fast renderer, encoder detection, benchmarks.
"""

import json
import os
import platform
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import zipfile

from config import DATA_DIR

TOOLS_DIR = os.path.join(DATA_DIR, "tools", "ffmpeg")
SETTINGS_PATH = os.path.join(DATA_DIR, "settings", "ffmpeg.json")

# Trusted FFmpeg download for application-local fallback
FFMPEG_DOWNLOAD_URL = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"

_cached_result = None


def _load_saved():
    if os.path.exists(SETTINGS_PATH):
        try:
            with open(SETTINGS_PATH) as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def _save_settings(data):
    os.makedirs(os.path.dirname(SETTINGS_PATH), exist_ok=True)
    tmp = SETTINGS_PATH + ".tmp"
    with open(tmp, "w") as f:
        json.dump(data, f, indent=2)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, SETTINGS_PATH)


def _run_check(exe, args, timeout=10):
    """Run an executable and return (success, stdout)."""
    try:
        r = subprocess.run(
            [exe] + args,
            capture_output=True, text=True, timeout=timeout,
            encoding="utf-8", errors="replace",
        )
        return r.returncode == 0, r.stdout + r.stderr
    except FileNotFoundError:
        return False, ""
    except Exception as e:
        return False, str(e)


def _find_exe(name):
    """Find an executable by checking saved path, PATH, and app-local."""
    saved = _load_saved()

    # 1. Saved configured path
    saved_path = saved.get(f"{name}_path")
    if saved_path and os.path.isfile(saved_path):
        ok, _ = _run_check(saved_path, ["-version"])
        if ok:
            return saved_path

    # 2. System PATH
    found = shutil.which(name)
    if found:
        ok, _ = _run_check(found, ["-version"])
        if ok:
            return found

    # 3. Application-local
    if sys.platform == "win32":
        local = os.path.join(TOOLS_DIR, f"{name}.exe")
    else:
        local = os.path.join(TOOLS_DIR, name)
    if os.path.isfile(local):
        ok, _ = _run_check(local, ["-version"])
        if ok:
            return local

    # 4. Common Windows locations
    if sys.platform == "win32":
        for base in [
            os.path.expandvars(r"%ProgramFiles%\ffmpeg\bin"),
            os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\WinGet\Packages"),
            r"C:\ffmpeg\bin",
            r"C:\tools\ffmpeg\bin",
        ]:
            candidate = os.path.join(base, f"{name}.exe")
            if os.path.isfile(candidate):
                ok, _ = _run_check(candidate, ["-version"])
                if ok:
                    return candidate
            # Search subdirectories (winget puts it in versioned folders)
            if os.path.isdir(base):
                for root, dirs, files in os.walk(base):
                    if f"{name}.exe" in files:
                        candidate = os.path.join(root, f"{name}.exe")
                        ok, _ = _run_check(candidate, ["-version"])
                        if ok:
                            return candidate
                    if len(dirs) > 10:
                        break

    return None


def resolve(force_refresh=False):
    """
    Resolve FFmpeg and FFprobe. Returns a dict with:
    - ffmpeg: path or None
    - ffprobe: path or None
    - version: string
    - source: "PATH", "configured", "app-local", or "missing"
    - encoders: dict of encoder -> bool
    - filters: list of filter names
    - valid: bool
    """
    global _cached_result
    if _cached_result and not force_refresh:
        return _cached_result

    ffmpeg = _find_exe("ffmpeg")
    ffprobe = _find_exe("ffprobe")

    result = {
        "ffmpeg": ffmpeg,
        "ffprobe": ffprobe,
        "version": "",
        "source": "missing",
        "encoders": {},
        "filters": [],
        "valid": False,
    }

    if not ffmpeg:
        _cached_result = result
        return result

    # Version
    ok, out = _run_check(ffmpeg, ["-version"])
    if ok:
        import re
        m = re.search(r"ffmpeg version\s+(\S+)", out)
        result["version"] = m.group(1) if m else "unknown"

    # Source
    saved = _load_saved()
    local_path = os.path.join(TOOLS_DIR, "ffmpeg.exe" if sys.platform == "win32" else "ffmpeg")
    if ffmpeg == saved.get("ffmpeg_path"):
        result["source"] = "configured"
    elif os.path.normpath(ffmpeg) == os.path.normpath(local_path):
        result["source"] = "app-local"
    else:
        result["source"] = "PATH"

    # Encoders
    ok, out = _run_check(ffmpeg, ["-hide_banner", "-encoders"])
    for enc in ["libx264", "libx265", "h264_nvenc", "hevc_nvenc",
                "h264_qsv", "hevc_qsv", "h264_amf", "hevc_amf"]:
        result["encoders"][enc] = enc in out

    # Filters (check for ass/subtitles)
    ok, out = _run_check(ffmpeg, ["-hide_banner", "-filters"])
    for filt in ["ass", "subtitles"]:
        if filt in out:
            result["filters"].append(filt)

    result["valid"] = True

    # Save paths
    _save_settings({
        "ffmpeg_path": ffmpeg,
        "ffprobe_path": ffprobe,
        "version": result["version"],
        "source": result["source"],
    })

    _cached_result = result
    return result


def get_ffmpeg():
    """Return the ffmpeg executable path, or raise if not found."""
    r = resolve()
    if not r["ffmpeg"]:
        raise RuntimeError(
            "FFmpeg is not installed. Run: python lyric-studio.py ffmpeg install"
        )
    return r["ffmpeg"]


def get_ffprobe():
    """Return the ffprobe executable path, or raise if not found."""
    r = resolve()
    if not r["ffprobe"]:
        raise RuntimeError(
            "FFprobe is not installed. Run: python lyric-studio.py ffmpeg install"
        )
    return r["ffprobe"]


# ── Installation ─────────────────────────────────────────────────────

def detect_package_managers():
    """Detect available Windows package managers."""
    managers = []
    if sys.platform != "win32":
        return managers
    # winget
    ok, _ = _run_check("winget", ["--version"])
    if ok:
        managers.append("winget")
    # chocolatey (only if already installed)
    ok, _ = _run_check("choco", ["--version"])
    if ok:
        managers.append("choco")
    return managers


def install_via_winget():
    """Install FFmpeg using winget."""
    cmd = ["winget", "install", "Gyan.FFmpeg",
           "--accept-package-agreements", "--accept-source-agreements"]
    r = subprocess.run(cmd, text=True, encoding="utf-8", errors="replace")
    return r.returncode == 0


def install_via_choco():
    """Install FFmpeg using Chocolatey."""
    cmd = ["choco", "install", "ffmpeg", "-y"]
    r = subprocess.run(cmd, text=True, encoding="utf-8", errors="replace")
    return r.returncode == 0


def install_app_local(on_progress=None):
    """Download and install FFmpeg to data/tools/ffmpeg/."""
    os.makedirs(TOOLS_DIR, exist_ok=True)
    zip_path = os.path.join(TOOLS_DIR, "ffmpeg.zip")

    # Download
    if on_progress:
        on_progress("Downloading FFmpeg...")
    try:
        urllib.request.urlretrieve(FFMPEG_DOWNLOAD_URL, zip_path)
    except Exception as e:
        raise RuntimeError(f"Download failed: {e}")

    # Extract only ffmpeg.exe and ffprobe.exe
    if on_progress:
        on_progress("Extracting...")
    try:
        with zipfile.ZipFile(zip_path, "r") as zf:
            for member in zf.namelist():
                basename = os.path.basename(member)
                if basename in ("ffmpeg.exe", "ffprobe.exe", "ffmpeg", "ffprobe"):
                    # Prevent path traversal
                    target = os.path.join(TOOLS_DIR, basename)
                    with zf.open(member) as src, open(target, "wb") as dst:
                        dst.write(src.read())
                    if sys.platform != "win32":
                        os.chmod(target, 0o755)
    except Exception as e:
        raise RuntimeError(f"Extraction failed: {e}")
    finally:
        if os.path.exists(zip_path):
            os.remove(zip_path)

    # Verify
    ffmpeg_exe = os.path.join(TOOLS_DIR, "ffmpeg.exe" if sys.platform == "win32" else "ffmpeg")
    ok, _ = _run_check(ffmpeg_exe, ["-version"])
    if not ok:
        raise RuntimeError("FFmpeg extracted but failed verification")

    _save_settings({
        "ffmpeg_path": ffmpeg_exe,
        "ffprobe_path": os.path.join(TOOLS_DIR, "ffprobe.exe" if sys.platform == "win32" else "ffprobe"),
        "source": "app-local",
    })

    # Clear cache
    global _cached_result
    _cached_result = None

    return True


def add_to_user_path(directory):
    """Add a directory to the current user's PATH on Windows."""
    if sys.platform != "win32":
        return False
    try:
        import winreg
        key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Environment", 0,
                             winreg.KEY_READ | winreg.KEY_WRITE)
        try:
            current, _ = winreg.QueryValueEx(key, "Path")
        except FileNotFoundError:
            current = ""

        # Check if already present
        paths = [p.strip() for p in current.split(";") if p.strip()]
        norm_dir = os.path.normpath(directory).lower()
        if any(os.path.normpath(p).lower() == norm_dir for p in paths):
            winreg.CloseKey(key)
            return True  # Already in PATH

        # Add
        new_path = current.rstrip(";") + ";" + directory
        winreg.SetValueEx(key, "Path", 0, winreg.REG_EXPAND_SZ, new_path)
        winreg.CloseKey(key)

        # Broadcast change
        try:
            import ctypes
            HWND_BROADCAST = 0xFFFF
            WM_SETTINGCHANGE = 0x001A
            ctypes.windll.user32.SendMessageW(HWND_BROADCAST, WM_SETTINGCHANGE, 0, "Environment")
        except Exception:
            pass

        # Also update current process
        os.environ["PATH"] = os.environ.get("PATH", "") + ";" + directory

        return True
    except Exception:
        return False


def add_to_process_path(directory):
    """Add a directory to the current process PATH."""
    path = os.environ.get("PATH", "")
    if directory not in path:
        os.environ["PATH"] = directory + os.pathsep + path


def remove_app_local():
    """Remove the application-local FFmpeg installation."""
    if os.path.isdir(TOOLS_DIR):
        shutil.rmtree(TOOLS_DIR, ignore_errors=True)
    saved = _load_saved()
    if saved.get("source") == "app-local":
        _save_settings({})
    global _cached_result
    _cached_result = None
    return True
