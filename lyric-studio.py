#!/usr/bin/env python3
"""
Lyric Studio CLI

Usage:
    python lyric-studio.py version           Show current version
    python lyric-studio.py update            Update application
    python lyric-studio.py update --check    Check for updates only
    python lyric-studio.py update --backup   Force backup before update
    python lyric-studio.py backup            Create a backup
    python lyric-studio.py migrate           Run schema migrations
    python lyric-studio.py render <project>  Render a project to MP4
    python lyric-studio.py start             Start backend + frontend
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


def cmd_version():
    v = get_app_version()
    print(f"Lyric Studio v{v['version']} (schema v{v['schema_version']})")


def cmd_backup(silent=False):
    """Create a backup of all user data (metadata only, not large binaries)."""
    ensure_data_dirs()
    ts = datetime.now().strftime("%Y_%m_%d_%H_%M")
    backup_dir = os.path.join(BACKUPS_DIR, f"backup_{ts}")
    os.makedirs(backup_dir, exist_ok=True)

    backed_up = []

    # Backup project metadata and lyrics
    if os.path.exists(PROJECTS_DIR):
        for name in os.listdir(PROJECTS_DIR):
            proj_dir = os.path.join(PROJECTS_DIR, name)
            if not os.path.isdir(proj_dir):
                continue
            dest = os.path.join(backup_dir, "projects", name)
            os.makedirs(dest, exist_ok=True)

            # project.json
            pj = os.path.join(proj_dir, "project.json")
            if os.path.exists(pj):
                shutil.copy2(pj, os.path.join(dest, "project.json"))

            # lyrics directory (small text files)
            lyrics_dir = os.path.join(proj_dir, "lyrics")
            if os.path.isdir(lyrics_dir):
                dest_lyrics = os.path.join(dest, "lyrics")
                shutil.copytree(lyrics_dir, dest_lyrics, dirs_exist_ok=True)

            backed_up.append(name)

    # Backup themes
    if os.path.exists(THEMES_DIR):
        dest_themes = os.path.join(backup_dir, "themes")
        shutil.copytree(THEMES_DIR, dest_themes, dirs_exist_ok=True)

    # Backup settings
    if os.path.exists(SETTINGS_DIR):
        dest_settings = os.path.join(backup_dir, "settings")
        shutil.copytree(SETTINGS_DIR, dest_settings, dirs_exist_ok=True)

    if not silent:
        print(f"Backup created: {backup_dir}")
        print(f"  Projects: {len(backed_up)}")
        if backed_up:
            for p in backed_up:
                print(f"    - {p}")

    return backup_dir


def cmd_update(check_only=False, force_backup=False):
    """Update application code via git pull."""
    ensure_data_dirs()
    v = get_app_version()
    print(f"Current version: {v['version']} (schema v{v['schema_version']})")

    # Check if we're in a git repo
    if not os.path.isdir(os.path.join(ROOT, ".git")):
        print("Error: Not a git repository. Cannot update.")
        sys.exit(1)

    # Fetch latest
    print("Checking for updates...")
    result = subprocess.run(
        ["git", "fetch", "origin"], cwd=ROOT,
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print(f"Error fetching: {result.stderr.strip()}")
        sys.exit(1)

    # Check if there are updates
    result = subprocess.run(
        ["git", "log", "HEAD..origin/main", "--oneline"],
        cwd=ROOT, capture_output=True, text=True
    )
    commits = [l for l in result.stdout.strip().split("\n") if l.strip()]

    if not commits:
        print("Already up to date.")
        return

    print(f"Available updates: {len(commits)} commit(s)")
    for c in commits[:10]:
        print(f"  {c}")
    if len(commits) > 10:
        print(f"  ... and {len(commits) - 10} more")

    if check_only:
        return

    # Create backup before updating
    if force_backup or True:  # always backup
        print("\nCreating backup...")
        backup_dir = cmd_backup(silent=True)
        print(f"  Backup: {backup_dir}")

    # Record current HEAD for rollback
    result = subprocess.run(
        ["git", "rev-parse", "HEAD"], cwd=ROOT,
        capture_output=True, text=True
    )
    old_head = result.stdout.strip()

    # Pull updates
    print("\nUpdating application...")
    result = subprocess.run(
        ["git", "pull", "origin", "main"], cwd=ROOT,
        capture_output=True, text=True
    )

    if result.returncode != 0:
        print(f"Update failed: {result.stderr.strip()}")
        print(f"Restoring to {old_head[:8]}...")
        subprocess.run(["git", "reset", "--hard", old_head], cwd=ROOT)
        print("Restored successfully.")
        sys.exit(1)

    print(result.stdout.strip())

    # Read new version
    new_v = get_app_version()
    print(f"\nUpdated to v{new_v['version']} (schema v{new_v['schema_version']})")

    # Run migrations if schema changed
    if new_v.get("schema_version", 1) > v.get("schema_version", 1):
        print("\nSchema changed — running migrations...")
        from migrate import migrate_all_projects
        n = migrate_all_projects()
        print(f"  Migrated {n} project(s)")

    # Reinstall dependencies if needed
    print("\nChecking dependencies...")
    req_changed = subprocess.run(
        ["git", "diff", old_head, "HEAD", "--name-only", "--", "backend/requirements.txt"],
        cwd=ROOT, capture_output=True, text=True
    ).stdout.strip()
    if req_changed:
        print("  Python dependencies changed — reinstalling...")
        subprocess.run(
            [sys.executable, "-m", "pip", "install", "-r", "backend/requirements.txt"],
            cwd=ROOT
        )

    pkg_changed = subprocess.run(
        ["git", "diff", old_head, "HEAD", "--name-only", "--", "frontend/package.json"],
        cwd=ROOT, capture_output=True, text=True
    ).stdout.strip()
    if pkg_changed:
        print("  Frontend dependencies changed — reinstalling...")
        subprocess.run(["npm", "install"], cwd=os.path.join(ROOT, "frontend"))

    if not req_changed and not pkg_changed:
        print("  Dependencies unchanged.")

    print("\nUpdate complete.")


def cmd_migrate():
    ensure_data_dirs()
    from migrate import migrate_all_projects, CURRENT_SCHEMA
    print(f"Current schema version: {CURRENT_SCHEMA}")
    n = migrate_all_projects()
    print(f"Migrated {n} project(s)")


def cmd_render(project_name: str):
    """Render a project to MP4. Delegates to render.py."""
    subprocess.run(
        [sys.executable, os.path.join(ROOT, "render.py"), project_name],
        cwd=ROOT
    )


def cmd_start():
    """Start backend and frontend."""
    ensure_data_dirs()

    # Run migrations on startup
    from migrate import migrate_all_projects
    migrate_all_projects()

    if sys.platform == "win32":
        script = os.path.join(ROOT, "start.ps1")
        subprocess.run(["powershell", "-ExecutionPolicy", "Bypass", "-File", script])
    else:
        # Start backend in background, frontend in foreground
        import signal
        backend = subprocess.Popen(
            [sys.executable, "main.py"],
            cwd=os.path.join(ROOT, "backend")
        )
        try:
            frontend = subprocess.run(
                ["npm", "run", "dev"],
                cwd=os.path.join(ROOT, "frontend")
            )
        finally:
            backend.terminate()
            backend.wait()


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(0)

    command = sys.argv[1]

    if command == "version":
        cmd_version()
    elif command == "update":
        check_only = "--check" in sys.argv
        force_backup = "--backup" in sys.argv
        cmd_update(check_only=check_only, force_backup=force_backup)
    elif command == "backup":
        cmd_backup()
    elif command == "migrate":
        cmd_migrate()
    elif command == "render":
        if len(sys.argv) < 3:
            print("Usage: lyric-studio render <project_name>")
            sys.exit(1)
        cmd_render(sys.argv[2])
    elif command == "start":
        cmd_start()
    else:
        print(f"Unknown command: {command}")
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()
