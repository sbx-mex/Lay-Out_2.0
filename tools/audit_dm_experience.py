#!/usr/bin/env python3
"""Valida el carrete consolidado y la captura rápida de Validación DM."""
from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
JS_PATH = ROOT / "dm-validation.js"
CSS_PATH = ROOT / "dm-validation.css"
CATALOG_PATH = ROOT / "data" / "layouts.json"
CONFIG_PATH = ROOT / "data" / "dm-infographic.json"


def fail(message: str) -> None:
    raise SystemExit(f"ERROR: {message}")


def require_markers(source: str, markers: tuple[str, ...], label: str) -> None:
    missing = [marker for marker in markers if marker not in source]
    if missing:
        fail(f"{label}: faltan {missing}")


def main() -> int:
    js = JS_PATH.read_text(encoding="utf-8")
    css = CSS_PATH.read_text(encoding="utf-8")
    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))

    syntax = subprocess.run(
        ["node", "--check", str(JS_PATH)],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    if syntax.returncode:
        fail(syntax.stderr.strip() or "dm-validation.js no tiene sintaxis válida")

    require_markers(js, (
        "preloadDmReferences",
        "scheduleDmPreload",
        "requestIdleCallback",
        "shiftDmVariant",
        "bindDmCarousel",
        "pointerdown",
        "pointermove",
        'event.key === "ArrowLeft"',
        "navigator.vibrate",
        'id="dmxCamera"',
        'capture="environment"',
        'id="dmxFile"',
        'camera.textContent = record ? "Retomar foto" : "Tomar foto"',
        'attach.textContent = record ? "Cambiar archivo" : "Adjuntar"',
        'improvementLabel.textContent = "Mejora continua"',
        "improvementHeight",
        "rowHeights.reduce",
    ), "experiencia DM")
    require_markers(css, (
        ".dmx-carousel",
        ".dmx-carousel-nav",
        ".dmx-carousel-progress",
        ".dmx-photo-actions",
        ".dmx-improvement",
        "touch-action:pan-y",
        "grid-template-columns:minmax(0,1fr)",
    ), "estilos DM")

    forbidden = (
        'className = "dmx-variant"',
        'select.setAttribute("aria-label", `Referencia',
        "<option",
    )
    present = [marker for marker in forbidden if marker in js]
    if present:
        fail(f"persisten listas desplegables de referencia: {present}")

    input_ids = re.findall(r'id="(dmx(?:Camera|File))"', js)
    if sorted(input_ids) != ["dmxCamera", "dmxFile"]:
        fail(f"entradas de fotografía incorrectas: {input_ids}")

    stations = catalog.get("stations", [])
    variant_counts = {station.get("id"): len(station.get("variants", [])) for station in stations}
    if len(stations) != 7 or any(count < 1 for count in variant_counts.values()):
        fail(f"catálogo DM incompleto: {variant_counts}")
    images = [variant.get("image") for station in stations for variant in station.get("variants", [])]
    missing_images = [relative for relative in images if not relative or not (ROOT / relative).is_file()]
    if missing_images:
        fail(f"faltan referencias del carrete: {missing_images[:5]}")

    if config.get("baseRowHeight", 0) < 650:
        fail("la fila base de la infografía no tiene la altura visual solicitada")
    if not 72 <= config.get("improvementHeight", 0) <= 120:
        fail("improvementHeight debe reservar una franja breve y legible")
    if config.get("minPhotoHeight", 0) < 500:
        fail("las fotografías consolidadas deben conservar al menos 500 px de alto")

    report = {
        "status": "ok",
        "stations": len(stations),
        "references": len(images),
        "referenceDropdowns": 0,
        "preload": "prioridad inmediata + cola progresiva",
        "navigation": ["deslizar", "flechas", "toque", "teclado"],
        "evidenceActions": ["Tomar foto", "Adjuntar"],
        "dynamicHeight": True,
        "continuousImprovement": True,
        "baseRowHeight": config["baseRowHeight"],
        "improvementHeight": config["improvementHeight"],
    }
    print(json.dumps(report, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
