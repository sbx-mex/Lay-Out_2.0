from __future__ import annotations

import argparse
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "data" / "layouts.json"
ASSET_ROOT = ROOT / "assets" / "layouts"


parser = argparse.ArgumentParser(description="Detecta o elimina imágenes de layout no referenciadas.")
parser.add_argument("--apply", action="store_true", help="Elimina los archivos obsoletos detectados.")
args = parser.parse_args()

data = json.loads(CATALOG.read_text(encoding="utf-8"))
referenced = {
    item["image"]
    for station in data.get("stations", [])
    for item in [*station.get("variants", []), *station.get("technical", [])]
}
existing = {path.relative_to(ROOT).as_posix(): path for path in ASSET_ROOT.rglob("*") if path.is_file()}
obsolete = sorted(set(existing) - referenced)
missing = sorted(referenced - set(existing))

if missing:
    raise SystemExit(f"ERROR: faltan imágenes referenciadas: {missing}")

if args.apply:
    for relative in obsolete:
        existing[relative].unlink()
    for directory in sorted((path for path in ASSET_ROOT.rglob("*") if path.is_dir()), reverse=True):
        if not any(directory.iterdir()):
            directory.rmdir()
    print(f"Eliminadas: {len(obsolete)}")
else:
    if obsolete:
        raise SystemExit("ERROR: imágenes obsoletas: " + ", ".join(obsolete))
    print("Sin imágenes obsoletas.")
