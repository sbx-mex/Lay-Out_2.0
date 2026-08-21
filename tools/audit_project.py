from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = ROOT / "data" / "layouts.json"
ASSET_ROOT = ROOT / "assets" / "layouts"
MAX_FILES = 99
MAX_BYTES = 25 * 1024 * 1024


def fail(message: str) -> None:
    raise SystemExit(f"ERROR: {message}")


if not (ROOT / "tools" / "audit_pdf_export.py").is_file():
    fail("falta el auditor de exportación PDF")
if 'const CACHE = "layout-2-remaster-v4";' not in (ROOT / "sw.js").read_text(encoding="utf-8"):
    fail("actualiza la versión de caché para distribuir la nueva exportación PDF")


catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
stations = catalog.get("stations", [])
variants = [variant for station in stations for variant in station.get("variants", [])]
technical = [item for station in stations for item in station.get("technical", [])]
records = variants + technical

if len(stations) != 7:
    fail(f"se esperaban 7 estaciones y se encontraron {len(stations)}")
if len(variants) != 85 or len(technical) != 16 or len(records) != 101:
    fail(f"conteo inválido: {len(variants)} acomodos + {len(technical)} técnicas")

variant_ids = [item.get("id") for item in variants]
if len(variant_ids) != len(set(variant_ids)):
    fail("hay IDs de acomodo duplicados")

paths = [item.get("image") for item in records]
if len(paths) != len(set(paths)):
    fail("hay rutas de imagen duplicadas")

orders = [item.get("sourceOrder") for item in records]
if sorted(orders) != list(range(1, 102)):
    fail("el orden fuente no cubre exactamente 1 a 101")

hashes: dict[str, str] = {}
for relative in paths:
    path = ROOT / relative
    if not path.is_file():
        fail(f"falta {relative}")
    if path.suffix.lower() != ".webp":
        fail(f"formato no permitido: {relative}")
    with Image.open(path) as image:
        if image.format != "WEBP" or image.width < 960 or image.height < 720:
            fail(f"imagen inválida o pequeña: {relative} {image.size}")
        image.verify()
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest in hashes:
        fail(f"contenido duplicado: {relative} y {hashes[digest]}")
    hashes[digest] = relative

for lot in sorted(ASSET_ROOT.glob("lote-*")):
    files = [item for item in lot.iterdir() if item.is_file()]
    total = sum(item.stat().st_size for item in files)
    if len(files) > MAX_FILES:
        fail(f"{lot.name} contiene {len(files)} archivos")
    if total > MAX_BYTES:
        fail(f"{lot.name} pesa {total / 1024 / 1024:.2f} MB")

all_catalog_images = {path.relative_to(ROOT).as_posix() for path in ASSET_ROOT.rglob("*") if path.is_file()}
unreferenced = sorted(all_catalog_images - set(paths))
if unreferenced:
    fail(f"imágenes obsoletas sin referencia: {unreferenced[:8]}")

report = {
    "status": "ok",
    "stations": len(stations),
    "variants": len(variants),
    "technical": len(technical),
    "images": len(records),
    "lots": {
        lot.name: {
            "files": len([item for item in lot.iterdir() if item.is_file()]),
            "megabytes": round(sum(item.stat().st_size for item in lot.iterdir() if item.is_file()) / 1024 / 1024, 2),
        }
        for lot in sorted(ASSET_ROOT.glob("lote-*"))
    },
}
(ROOT / "data" / "audit_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(report, ensure_ascii=False))
