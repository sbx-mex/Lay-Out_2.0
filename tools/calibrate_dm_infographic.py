from __future__ import annotations

import argparse
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / "data" / "dm-infographic.json"


def fail(message: str) -> None:
    raise SystemExit(f"ERROR: {message}")


def clamp(value: int, minimum: int, maximum: int) -> int:
    return min(maximum, max(minimum, value))


def calculate(config: dict[str, int | float], stations: int) -> dict[str, int | float]:
    row_height = clamp(
        round(config["baseRowHeight"] - (stations - 6) * config["rowAdjustmentPerStation"]),
        int(config["minRowHeight"]),
        int(config["maxRowHeight"]),
    )
    photo_height = row_height - int(config["stationHeaderHeight"]) - 20
    content_width = int(config["canvasWidth"]) - int(config["outerPadding"]) * 2
    photo_width = round((content_width - int(config["columnGap"])) / 2)
    output_height = (
        int(config["headerHeight"])
        + int(config["columnHeaderHeight"])
        + int(config["outerPadding"])
        + stations * row_height
        + max(0, stations - 1) * int(config["rowGap"])
        + int(config["footerHeight"])
    )
    return {
        "stations": stations,
        "canvasWidth": int(config["canvasWidth"]),
        "canvasHeight": output_height,
        "rowHeight": row_height,
        "photoWidth": photo_width,
        "photoHeight": photo_height,
        "photoMegapixels": round(photo_width * photo_height / 1_000_000, 2),
        "canvasAspect": round(output_height / int(config["canvasWidth"]), 2),
    }


def validate(config: dict[str, int | float], results: list[dict[str, int | float]]) -> None:
    required = {
        "version", "canvasWidth", "headerHeight", "columnHeaderHeight", "footerHeight",
        "outerPadding", "columnGap", "rowGap", "stationHeaderHeight", "baseRowHeight",
        "rowAdjustmentPerStation", "minRowHeight", "maxRowHeight", "minPhotoHeight",
        "imageQuality",
    }
    missing = sorted(required - config.keys())
    if missing:
        fail(f"faltan parámetros del calibrador: {missing}")
    if config["version"] != 1 or config["canvasWidth"] != 1800:
        fail("la infografía debe conservar versión 1 y ancho premium de 1800 px")
    if not 0.9 <= float(config["imageQuality"]) <= 0.96:
        fail("imageQuality debe permanecer entre 0.90 y 0.96")
    if not 520 <= int(config["minRowHeight"]) <= int(config["maxRowHeight"]) <= 660:
        fail("los límites de altura por estación no son seguros")
    if any(result["photoHeight"] < config["minPhotoHeight"] for result in results):
        fail("alguna fotografía queda por debajo de la altura mínima legible")
    if [result["canvasHeight"] for result in results] != sorted(result["canvasHeight"] for result in results):
        fail("la altura final debe crecer al agregar estaciones")
    if [result["rowHeight"] for result in results] != sorted((result["rowHeight"] for result in results), reverse=True):
        fail("la altura de cada estación debe ajustarse proporcionalmente")
    if any(not 1.8 <= result["canvasAspect"] <= 2.6 for result in results):
        fail("la proporción final sale del rango vertical útil")
    if any(result["photoWidth"] < 800 for result in results):
        fail("las fotografías no aprovechan el ancho premium")


def main() -> None:
    parser = argparse.ArgumentParser(description="Calibra la infografía dinámica de Validación DM.")
    parser.add_argument("--check", action="store_true", help="Falla si la geometría no cumple los límites premium.")
    args = parser.parse_args()
    config = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    results = [calculate(config, stations) for stations in (5, 6, 7)]
    validate(config, results)
    print(json.dumps({"status": "ok", "mode": "check" if args.check else "report", "presets": results}, ensure_ascii=False))


if __name__ == "__main__":
    main()
