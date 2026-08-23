from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = ROOT / "data" / "layouts.json"
SOURCE_BUDGETS = {
    "index.html": 16 * 1024,
    "styles.css": 24 * 1024,
    "app.js": 48 * 1024,
    "data/layouts.json": 64 * 1024,
}


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

for relative, limit in SOURCE_BUDGETS.items():
    size = (ROOT / relative).stat().st_size
    if size > limit:
        fail(f"{relative} excede el presupuesto: {size} > {limit} bytes")

priority_assets = [station["variants"][0]["image"] for station in stations if station.get("variants")]
if len(priority_assets) != len(stations) or len(priority_assets) != len(set(priority_assets)):
    fail("cada estación debe tener una referencia prioritaria única")

total_priority_bytes = sum((ROOT / relative).stat().st_size for relative in priority_assets)
if total_priority_bytes > 4 * 1024 * 1024:
    fail("la precarga prioritaria supera 4 MB")

print(json.dumps({
    "status": "ok",
    "sourceBudgets": {path: (ROOT / path).stat().st_size for path in SOURCE_BUDGETS},
    "priorityAssets": len(priority_assets),
    "priorityMegabytes": round(total_priority_bytes / 1024 / 1024, 2),
}, ensure_ascii=False))
