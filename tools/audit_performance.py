from __future__ import annotations

import gzip
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = ROOT / "data" / "layouts.json"
RAW_SOURCE_BUDGETS = {
    "index.html": 16 * 1024,
    "styles.css": 24 * 1024,
    "app.js": 48 * 1024,
    "dm-validation.css": 24 * 1024,
    "dm-validation.js": 48 * 1024,
    "sw.js": 6 * 1024,
    "data/dm-infographic.json": 4 * 1024,
    "data/layouts.json": 64 * 1024,
}
GZIP_SOURCE_BUDGETS = {
    "index.html": 5 * 1024,
    "styles.css": 6 * 1024,
    "app.js": 12 * 1024,
    "dm-validation.css": 5 * 1024,
    "dm-validation.js": 13 * 1024,
    "sw.js": 2 * 1024,
    "data/dm-infographic.json": 1024,
    "data/layouts.json": 8 * 1024,
}
TOTAL_GZIP_BUDGET = 48 * 1024


def fail(message: str) -> None:
    raise SystemExit(f"ERROR: {message}")


catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
performance = catalog.get("performance", {})
stations = catalog.get("stations", [])

if performance.get("precachePerStation") != 1:
    fail("precachePerStation debe ser 1 para evitar descargar el catálogo visual completo al instalar")
if performance.get("referenceDisplayMode") != "native":
    fail("las referencias deben renderizarse de forma nativa, sin reprocesarlas en canvas")
if performance.get("adjacentPrefetch") != 1:
    fail("adjacentPrefetch debe limitarse a una referencia vecina por dirección")
if not 36 <= performance.get("swipeThreshold", 0) <= 72:
    fail("swipeThreshold está fuera del rango estable para móviles")
cleanup = performance.get("referenceCleanup", {})
if cleanup.get("references") != 85 or cleanup.get("fit") != "contain-max":
    fail("la configuración de referencias limpias está incompleta")
if not 1200 <= performance.get("evidenceTargetWidth", 0) <= 2200:
    fail("evidenceTargetWidth está fuera del rango seguro")
if not 1600 <= performance.get("evidenceMaxPixels", 0) <= 2600:
    fail("evidenceMaxPixels está fuera del rango seguro")

if RAW_SOURCE_BUDGETS.keys() != GZIP_SOURCE_BUDGETS.keys():
    fail("los presupuestos raw y gzip no cubren los mismos archivos")

raw_sizes: dict[str, int] = {}
gzip_sizes: dict[str, int] = {}
for relative, raw_limit in RAW_SOURCE_BUDGETS.items():
    payload = (ROOT / relative).read_bytes()
    raw_size = len(payload)
    gzip_size = len(gzip.compress(payload, compresslevel=9, mtime=0))
    raw_sizes[relative] = raw_size
    gzip_sizes[relative] = gzip_size
    if raw_size > raw_limit:
        fail(f"{relative} excede el presupuesto raw: {raw_size} > {raw_limit} bytes")
    gzip_limit = GZIP_SOURCE_BUDGETS[relative]
    if gzip_size > gzip_limit:
        fail(f"{relative} excede el presupuesto gzip: {gzip_size} > {gzip_limit} bytes")

total_gzip = sum(gzip_sizes.values())
if total_gzip > TOTAL_GZIP_BUDGET:
    fail(f"la carga fuente comprimida excede el presupuesto: {total_gzip} > {TOTAL_GZIP_BUDGET} bytes")

hidden_ids = set(catalog.get("experience", {}).get("hiddenStationIds", []))
visible_stations = [station for station in stations if station.get("id") not in hidden_ids]
priority_assets = [station["variants"][0]["image"] for station in visible_stations if station.get("variants")]
if len(priority_assets) != len(visible_stations) or len(priority_assets) != len(set(priority_assets)):
    fail("cada estación debe tener una referencia prioritaria única")

total_priority_bytes = sum((ROOT / relative).stat().st_size for relative in priority_assets)
if total_priority_bytes > 4 * 1024 * 1024:
    fail("la precarga prioritaria supera 4 MB")

print(json.dumps({
    "status": "ok",
    "rawBytes": raw_sizes,
    "gzipBytes": gzip_sizes,
    "totalGzipBytes": total_gzip,
    "priorityAssets": len(priority_assets),
    "hiddenStations": sorted(hidden_ids),
    "priorityMegabytes": round(total_priority_bytes / 1024 / 1024, 2),
}, ensure_ascii=False))
