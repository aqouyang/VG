"""
Central path configuration.

All user data lives under DATA_DIR (default: <repo>/data/).
Application code lives under APP_DIR (the repo root).
These are kept strictly separate so updates never touch user data.
"""

import os
import json

APP_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# DATA_DIR can be overridden via environment variable
DATA_DIR = os.environ.get("LYRIC_STUDIO_DATA", os.path.join(APP_DIR, "data"))

PROJECTS_DIR = os.path.join(DATA_DIR, "projects")
THEMES_DIR = os.path.join(DATA_DIR, "themes")
EXPORTS_DIR = os.path.join(DATA_DIR, "exports")
SETTINGS_DIR = os.path.join(DATA_DIR, "settings")
BACKUPS_DIR = os.path.join(DATA_DIR, "backups")

VERSION_FILE = os.path.join(APP_DIR, "version.json")


def ensure_data_dirs():
    """Create all data directories if they don't exist."""
    for d in [DATA_DIR, PROJECTS_DIR, THEMES_DIR, EXPORTS_DIR, SETTINGS_DIR, BACKUPS_DIR]:
        os.makedirs(d, exist_ok=True)


def get_app_version() -> dict:
    """Read version.json from the application directory."""
    if os.path.exists(VERSION_FILE):
        with open(VERSION_FILE) as f:
            return json.load(f)
    return {"version": "0.0.0", "schema_version": 1}


def get_schema_version() -> int:
    return get_app_version().get("schema_version", 1)
