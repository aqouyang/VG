"""
Project schema migration system.

Each migration function upgrades from version N to N+1.
Unknown fields are always preserved.
"""

import os
import json
import shutil
from config import PROJECTS_DIR, get_schema_version

CURRENT_SCHEMA = get_schema_version()


# --- Migration functions ---
# Each takes a project dict and returns the upgraded dict.

def migrate_0_to_1(data: dict) -> dict:
    """Initial schema: ensure all required fields exist."""
    defaults = {
        "name": data.get("name", "unknown"),
        "title": data.get("title", "Untitled"),
        "artist": data.get("artist", ""),
        "audio_file": None,
        "lyrics_file": None,
        "lrc_file": None,
        "cover_file": None,
        "duration": None,
    }
    for key, val in defaults.items():
        if key not in data:
            data[key] = val
    data["schema_version"] = 1
    return data


MIGRATIONS = {
    # from_version: migration_function
    0: migrate_0_to_1,
}


def get_project_schema_version(data: dict) -> int:
    return data.get("schema_version", 0)


def migrate_project(data: dict) -> dict:
    """Migrate a project dict to the current schema version.
    Unknown fields are never removed."""
    version = get_project_schema_version(data)

    while version < CURRENT_SCHEMA:
        fn = MIGRATIONS.get(version)
        if fn is None:
            # No migration path — just stamp the version
            data["schema_version"] = CURRENT_SCHEMA
            break
        data = fn(data)
        version = get_project_schema_version(data)

    return data


def migrate_all_projects():
    """Scan all projects and migrate if needed."""
    if not os.path.exists(PROJECTS_DIR):
        return

    migrated = 0
    for name in os.listdir(PROJECTS_DIR):
        pj_path = os.path.join(PROJECTS_DIR, name, "project.json")
        if not os.path.isfile(pj_path):
            continue

        with open(pj_path) as f:
            data = json.load(f)

        old_version = get_project_schema_version(data)
        if old_version >= CURRENT_SCHEMA:
            continue

        data = migrate_project(data)

        with open(pj_path, "w") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

        migrated += 1
        print(f"  Migrated {name}: v{old_version} -> v{data.get('schema_version')}")

    return migrated


if __name__ == "__main__":
    print(f"Current schema version: {CURRENT_SCHEMA}")
    n = migrate_all_projects()
    print(f"Migrated {n} project(s)")
