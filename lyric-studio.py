#!/usr/bin/env python3
"""
Lyric Studio CLI

Usage:
    python lyric-studio.py <command> [options]

Commands:
    version         Show current version
    start           Start backend and frontend servers
    render <name>   Render a project to MP4
    update          Update application code
    backup          Create a backup of user data
    migrate         Run schema migrations

Update options:
    --check         Only check for updates, don't apply
    --backup        Force backup before update
"""

import json
import os
import shutil
import subprocess
import sys
from datetime import datetime

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ROOT, "backend"))

from config import (
    APP_DIR, DATA_DIR, PROJECTS_DIR, THEMES_DIR, EXPORTS_DIR,
    SETTINGS_DIR, BACKUPS_DIR, ensure_data_dirs, get_app_version,
)

# --- Colors ---
class C:
    BOLD = "\033[1m"
    DIM = "\033[2m"
    PURPLE = "\033[38;5;141m"
    GREEN = "\033[38;5;114m"
    YELLOW = "\033[38;5;221m"
    RED = "\033[38;5;203m"
    CYAN = "\033[38;5;117m"
    RESET = "\033[0m"

    @staticmethod
    def disable():
        for attr in ["BOLD", "DIM", "PURPLE", "GREEN", "YELLOW", "RED", "CYAN", "RESET"]:
            setattr(C, attr, "")

# Disable colors if not a terminal
if not sys.stdout.isatty():
    C.disable()


def log(msg: str): print(msg)
def info(msg: str): print(f"  {C.DIM}{msg}{C.RESET}")
def ok(msg: str): print(f"  {C.GREEN}\u2713{C.RESET} {msg}")
def warn(msg: str): print(f"  {C.YELLOW}\u26A0{C.RESET} {msg}")
def err(msg: str): print(f"  {C.RED}\u2717{C.RESET} {msg}")
def heading(msg: str): print(f"\n{C.BOLD}{C.PURPLE}{msg}{C.RESET}")


def cmd_version():
    v = get_app_version()
    log(f"{C.BOLD}Lyric Studio{C.RESET} {C.PURPLE}v{v['version']}{C.RESET} {C.DIM}(schema v{v['schema_version']}){C.RESET}")


def cmd_backup(silent=False):
    ensure_data_dirs()
    ts = datetime.now().strftime("%Y_%m_%d_%H_%M")
    backup_dir = os.path.join(BACKUPS_DIR, f"backup_{ts}")
    os.makedirs(backup_dir, exist_ok=True)

    backed_up = []
    if os.path.exists(PROJECTS_DIR):
        for name in os.listdir(PROJECTS_DIR):
            proj_dir = os.path.join(PROJECTS_DIR, name)
            if not os.path.isdir(proj_dir): continue
            dest = os.path.join(backup_dir, "projects", name)
            os.makedirs(dest, exist_ok=True)
            pj = os.path.join(proj_dir, "project.json")
            if os.path.exists(pj):
                shutil.copy2(pj, os.path.join(dest, "project.json"))
            lyrics_dir = os.path.join(proj_dir, "lyrics")
            if os.path.isdir(lyrics_dir):
                shutil.copytree(lyrics_dir, os.path.join(dest, "lyrics"), dirs_exist_ok=True)
            backed_up.append(name)

    if os.path.exists(THEMES_DIR):
        shutil.copytree(THEMES_DIR, os.path.join(backup_dir, "themes"), dirs_exist_ok=True)
    if os.path.exists(SETTINGS_DIR):
        shutil.copytree(SETTINGS_DIR, os.path.join(backup_dir, "settings"), dirs_exist_ok=True)

    if not silent:
        heading("Backup created")
        ok(f"Location: {C.CYAN}{backup_dir}{C.RESET}")
        ok(f"Projects: {len(backed_up)}")
        for p in backed_up:
            info(f"  {p}")

    return backup_dir


def cmd_update(check_only=False, force_backup=False):
    ensure_data_dirs()
    v = get_app_version()
    heading("Lyric Studio Update")
    info(f"Current: v{v['version']} (schema v{v['schema_version']})")

    if not os.path.isdir(os.path.join(ROOT, ".git")):
        err("Not a git repository. Cannot update.")
        sys.exit(1)

    log(f"\n  {C.DIM}Checking for updates...{C.RESET}")
    result = subprocess.run(["git", "fetch", "origin"], cwd=ROOT, capture_output=True, text=True)
    if result.returncode != 0:
        err(f"Fetch failed: {result.stderr.strip()}")
        sys.exit(1)

    result = subprocess.run(
        ["git", "log", "HEAD..origin/main", "--oneline"],
        cwd=ROOT, capture_output=True, text=True
    )
    commits = [l for l in result.stdout.strip().split("\n") if l.strip()]

    if not commits:
        ok("Already up to date.")
        return

    log(f"\n  {C.GREEN}{len(commits)}{C.RESET} update(s) available:")
    for c in commits[:8]:
        info(f"  {c}")
    if len(commits) > 8:
        info(f"  ... and {len(commits) - 8} more")

    if check_only:
        return

    # Backup
    log(f"\n  {C.DIM}Creating backup...{C.RESET}")
    backup_dir = cmd_backup(silent=True)
    ok(f"Backup: {backup_dir}")

    # Record HEAD for rollback
    old_head = subprocess.run(
        ["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True, text=True
    ).stdout.strip()

    # Pull
    log(f"\n  {C.DIM}Pulling updates...{C.RESET}")
    result = subprocess.run(["git", "pull", "origin", "main"], cwd=ROOT, capture_output=True, text=True)

    if result.returncode != 0:
        err(f"Update failed: {result.stderr.strip()}")
        warn(f"Rolling back to {old_head[:8]}...")
        subprocess.run(["git", "reset", "--hard", old_head], cwd=ROOT)
        ok("Restored successfully.")
        sys.exit(1)

    new_v = get_app_version()
    ok(f"Updated to v{new_v['version']}")

    # Migrations
    if new_v.get("schema_version", 1) > v.get("schema_version", 1):
        log(f"\n  {C.DIM}Running migrations...{C.RESET}")
        from migrate import migrate_all_projects
        n = migrate_all_projects()
        ok(f"Migrated {n} project(s)")

    # Dependencies
    log(f"\n  {C.DIM}Checking dependencies...{C.RESET}")
    req_changed = subprocess.run(
        ["git", "diff", old_head, "HEAD", "--name-only", "--", "backend/requirements.txt"],
        cwd=ROOT, capture_output=True, text=True
    ).stdout.strip()
    if req_changed:
        warn("Python dependencies changed - reinstalling...")
        subprocess.run([sys.executable, "-m", "pip", "install", "-r", "backend/requirements.txt"], cwd=ROOT)

    pkg_changed = subprocess.run(
        ["git", "diff", old_head, "HEAD", "--name-only", "--", "frontend/package.json"],
        cwd=ROOT, capture_output=True, text=True
    ).stdout.strip()
    if pkg_changed:
        warn("Frontend dependencies changed - reinstalling...")
        subprocess.run(["npm", "install"], cwd=os.path.join(ROOT, "frontend"), shell=(sys.platform == "win32"))

    if not req_changed and not pkg_changed:
        ok("Dependencies unchanged.")

    # Always rebuild frontend if any frontend source changed
    frontend_changed = subprocess.run(
        ["git", "diff", old_head, "HEAD", "--name-only", "--", "frontend/src/"],
        cwd=ROOT, capture_output=True, text=True
    ).stdout.strip()
    if frontend_changed or pkg_changed:
        log(f"\n  {C.DIM}Rebuilding frontend...{C.RESET}")
        # Clear stale build artifacts
        dist_dir = os.path.join(ROOT, "frontend", "dist")
        if os.path.exists(dist_dir):
            shutil.rmtree(dist_dir)
        r = subprocess.run(
            ["npm", "run", "build"],
            cwd=os.path.join(ROOT, "frontend"),
            capture_output=True, text=True,
            shell=(sys.platform == "win32"),
        )
        if r.returncode == 0:
            ok("Frontend rebuilt successfully.")
        else:
            warn(f"Frontend build failed: {r.stderr.strip()[:200]}")
    else:
        ok("Frontend unchanged — no rebuild needed.")

    log("")
    warn("Restart the servers for changes to take effect.")
    info("Run: python lyric-studio.py start")

    heading("Update complete")


def cmd_migrate():
    ensure_data_dirs()
    from migrate import migrate_all_projects, CURRENT_SCHEMA
    heading("Schema Migration")
    info(f"Target schema: v{CURRENT_SCHEMA}")
    n = migrate_all_projects()
    ok(f"Migrated {n} project(s)")


def cmd_render(project_name: str):
    subprocess.run([sys.executable, os.path.join(ROOT, "render.py"), project_name], cwd=ROOT)


# ─── FFmpeg management ───────────────────────────────────────────────

def _check_ffmpeg(quiet=False):
    """Check FFmpeg availability. Returns True if usable."""
    from ffmpeg_resolver import resolve
    r = resolve(force_refresh=True)
    if r["valid"]:
        if not quiet:
            ok(f"FFmpeg: {r['version']} ({r['source']})")
            info(f"  Path: {r['ffmpeg']}")
            if r["ffprobe"]:
                info(f"  FFprobe: {r['ffprobe']}")
        return True
    return False


def _install_ffmpeg_interactive():
    """Interactive FFmpeg installation flow."""
    from ffmpeg_resolver import (
        detect_package_managers, install_via_winget, install_via_choco,
        install_app_local, add_to_user_path, add_to_process_path, resolve,
    )

    log("")
    warn("FFmpeg is required for video export but was not found.")
    log("")

    answer = input(f"  Would you like Lyric Studio to install it now? [Y/n] ").strip().lower()
    if answer and answer not in ("y", "yes"):
        warn("FFmpeg not installed. Export features will be unavailable.")
        info("To install manually: https://ffmpeg.org/download.html")
        return False

    managers = detect_package_managers()
    installed = False

    if "winget" in managers:
        log(f"\n  {C.DIM}Installing via winget...{C.RESET}")
        installed = install_via_winget()
        if installed:
            ok("FFmpeg installed via winget.")
    elif "choco" in managers:
        log(f"\n  {C.DIM}Installing via Chocolatey...{C.RESET}")
        installed = install_via_choco()
        if installed:
            ok("FFmpeg installed via Chocolatey.")

    if not installed:
        log("")
        log(f"  {C.DIM}No package manager available (winget or Chocolatey).{C.RESET}")
        answer2 = input(f"  Install an application-local copy instead? [Y/n] ").strip().lower()
        if answer2 and answer2 not in ("y", "yes"):
            warn("FFmpeg not installed.")
            return False

        log(f"\n  {C.DIM}Downloading FFmpeg (this may take a minute)...{C.RESET}")
        try:
            install_app_local(on_progress=lambda msg: info(msg))
            ok("FFmpeg installed to application data directory.")
            installed = True
        except Exception as e:
            err(f"Installation failed: {e}")
            return False

    if not installed:
        return False

    # Re-detect and add to PATH
    r = resolve(force_refresh=True)
    if r["valid"]:
        ffmpeg_dir = os.path.dirname(r["ffmpeg"])
        add_to_process_path(ffmpeg_dir)

        if sys.platform == "win32" and r["source"] != "app-local":
            add_to_user_path(ffmpeg_dir)
            ok("Added to user PATH.")

        ok(f"FFmpeg {r['version']} ready.")

        # Show encoder capabilities
        encs = [k for k, v in r["encoders"].items() if v]
        if encs:
            info(f"  Encoders: {', '.join(encs)}")
        if "ass" in r["filters"]:
            info("  Subtitle filter (libass): available")
        return True

    err("FFmpeg installed but could not be verified.")
    return False


def cmd_ffmpeg(subcmd: str):
    """Handle ffmpeg subcommands."""
    from ffmpeg_resolver import resolve, remove_app_local

    if subcmd == "status":
        heading("FFmpeg Status")
        r = resolve(force_refresh=True)
        if r["valid"]:
            ok(f"Version: {r['version']}")
            info(f"FFmpeg:  {r['ffmpeg']}")
            info(f"FFprobe: {r['ffprobe'] or 'not found'}")
            info(f"Source:  {r['source']}")
            log("")
            info("Filters:")
            info(f"  libass: {'yes' if 'ass' in r['filters'] else 'no'}")
            log("")
            info("Encoders:")
            for enc, avail in sorted(r["encoders"].items()):
                status = f"{C.GREEN}yes{C.RESET}" if avail else f"{C.DIM}no{C.RESET}"
                info(f"  {enc}: {status}")
        else:
            err("FFmpeg is not installed.")
            info("Run: python lyric-studio.py ffmpeg install")

    elif subcmd == "install":
        heading("FFmpeg Installation")
        if _check_ffmpeg(quiet=True):
            r = resolve()
            ok(f"FFmpeg is already installed ({r['version']}, {r['source']}).")
            info(f"Path: {r['ffmpeg']}")
            return
        _install_ffmpeg_interactive()

    elif subcmd == "repair":
        heading("FFmpeg Repair")
        r = resolve(force_refresh=True)
        if r["valid"]:
            ok(f"FFmpeg is working ({r['version']}).")
        else:
            warn("FFmpeg not found. Attempting repair...")
            _install_ffmpeg_interactive()

    elif subcmd == "remove-local":
        heading("Remove Application-Local FFmpeg")
        r = resolve()
        if r.get("source") != "app-local":
            warn("No application-local FFmpeg installation found.")
            return
        remove_app_local()
        ok("Application-local FFmpeg removed.")

    else:
        err(f"Unknown ffmpeg subcommand: {subcmd}")
        log(f"""
{C.BOLD}Usage:{C.RESET} python lyric-studio.py ffmpeg {C.CYAN}<subcommand>{C.RESET}

{C.BOLD}Subcommands:{C.RESET}
  {C.CYAN}status{C.RESET}       Show FFmpeg path, version, and capabilities
  {C.CYAN}install{C.RESET}      Install FFmpeg interactively
  {C.CYAN}repair{C.RESET}       Re-detect and fix FFmpeg configuration
  {C.CYAN}remove-local{C.RESET} Remove the application-local FFmpeg copy
""")


def cmd_start():
    ensure_data_dirs()
    from migrate import migrate_all_projects
    migrate_all_projects()

    heading("Lyric Studio")

    # Check FFmpeg
    if not _check_ffmpeg(quiet=True):
        _install_ffmpeg_interactive()

    info("Starting servers...")

    if sys.platform == "win32":
        script = os.path.join(ROOT, "start.ps1")
        subprocess.run(["powershell", "-ExecutionPolicy", "Bypass", "-File", script])
    else:
        backend = subprocess.Popen(
            [sys.executable, "main.py"],
            cwd=os.path.join(ROOT, "backend")
        )
        ok(f"Backend: http://localhost:8000 (PID {backend.pid})")
        try:
            ok("Frontend: http://localhost:3000")
            log("")
            subprocess.run(["npm", "run", "dev"], cwd=os.path.join(ROOT, "frontend"), shell=(sys.platform == "win32"))
        finally:
            backend.terminate()
            backend.wait()


def cmd_help():
    cmd_version()
    log(f"""
{C.BOLD}Usage:{C.RESET} python lyric-studio.py {C.CYAN}<command>{C.RESET} [options]

{C.BOLD}Commands:{C.RESET}
  {C.CYAN}start{C.RESET}             Start backend and frontend servers
  {C.CYAN}render{C.RESET} <project>  Render a project to MP4
  {C.CYAN}update{C.RESET}            Update application code safely
  {C.CYAN}backup{C.RESET}            Create a backup of user data
  {C.CYAN}migrate{C.RESET}           Run project schema migrations
  {C.CYAN}ffmpeg{C.RESET} <sub>      Manage FFmpeg (status, install, repair)
  {C.CYAN}version{C.RESET}           Show current version

{C.BOLD}Update options:{C.RESET}
  {C.DIM}--check{C.RESET}            Only check for updates
  {C.DIM}--backup{C.RESET}           Force backup before updating

{C.BOLD}Data directory:{C.RESET} {C.DIM}{DATA_DIR}{C.RESET}
""")


def main():
    if len(sys.argv) < 2 or sys.argv[1] in ("--help", "-h", "help"):
        cmd_help()
        sys.exit(0)

    command = sys.argv[1]

    if command == "version":
        cmd_version()
    elif command == "update":
        cmd_update(
            check_only="--check" in sys.argv,
            force_backup="--backup" in sys.argv,
        )
    elif command == "backup":
        cmd_backup()
    elif command == "migrate":
        cmd_migrate()
    elif command == "render":
        if len(sys.argv) < 3:
            err("Usage: lyric-studio render <project_name>")
            sys.exit(1)
        cmd_render(sys.argv[2])
    elif command == "ffmpeg":
        subcmd = sys.argv[2] if len(sys.argv) > 2 else "status"
        cmd_ffmpeg(subcmd)
    elif command == "start":
        cmd_start()
    else:
        err(f"Unknown command: {command}")
        cmd_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
