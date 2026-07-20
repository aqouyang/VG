import os
import json
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Any

router = APIRouter()

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
THEMES_DIR = os.path.join(ROOT_DIR, "themes")
os.makedirs(THEMES_DIR, exist_ok=True)


class ThemeSave(BaseModel):
    name: str
    label: str
    config: dict[str, Any]


@router.get("")
def list_themes():
    themes = []
    for f in sorted(os.listdir(THEMES_DIR)):
        if f.endswith(".json"):
            with open(os.path.join(THEMES_DIR, f)) as fh:
                themes.append(json.load(fh))
    return themes


@router.get("/{name}")
def get_theme(name: str):
    path = os.path.join(THEMES_DIR, f"{name}.json")
    if not os.path.exists(path):
        raise HTTPException(404, "Theme not found")
    with open(path) as f:
        return json.load(f)


@router.post("")
def save_theme(theme: ThemeSave):
    path = os.path.join(THEMES_DIR, f"{theme.name}.json")
    data = {"name": theme.name, "label": theme.label, "config": theme.config}
    with open(path, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    return data


@router.delete("/{name}")
def delete_theme(name: str):
    path = os.path.join(THEMES_DIR, f"{name}.json")
    if not os.path.exists(path):
        raise HTTPException(404, "Theme not found")
    os.remove(path)
    return {"deleted": name}
