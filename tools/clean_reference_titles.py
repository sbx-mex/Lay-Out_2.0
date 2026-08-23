from __future__ import annotations

import argparse
import json
import os
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage


ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = ROOT / "data" / "layouts.json"
WHITE_THRESHOLD = 242
COMPONENT_RATIO = 0.0008
MIN_COMPONENT_AREA = 1200
MIN_TITLE_AREA = 500
MIN_TITLE_COMPONENTS = 2
MIN_DESIGN_START = 45
CANVAS_PADDING_RATIO = 0.012
WEBP_QUALITY = 95


def fail(message: str) -> None:
    raise SystemExit(f"ERROR: {message}")


def reference_paths() -> list[Path]:
    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    return [ROOT / variant["image"] for station in catalog["stations"] for variant in station["variants"]]


def visual_mask(image: Image.Image) -> np.ndarray:
    rgb = np.asarray(image.convert("RGB"))
    return np.min(rgb, axis=2) < WHITE_THRESHOLD


def analyze(mask: np.ndarray) -> dict[str, int | bool]:
    labels, count = ndimage.label(mask)
    areas = np.bincount(labels.ravel())
    objects = ndimage.find_objects(labels)
    threshold = max(MIN_COMPONENT_AREA, int(mask.size * COMPONENT_RATIO))
    significant = [objects[index - 1] for index in range(1, count + 1) if areas[index] >= threshold]
    if not significant:
        fail("la referencia no contiene un Lay Out detectable")
    design_start = min(component[0].start for component in significant)
    title_area = int(mask[:design_start].sum())
    title_components = sum(
        1
        for index in range(1, count + 1)
        if objects[index - 1][0].stop <= design_start and areas[index] >= 20
    )
    has_title = (
        design_start >= MIN_DESIGN_START
        and title_area >= MIN_TITLE_AREA
        and title_components >= MIN_TITLE_COMPONENTS
    )
    return {
        "designStart": design_start,
        "titleArea": title_area,
        "titleComponents": title_components,
        "hasTitle": has_title,
    }


def content_box(mask: np.ndarray, design_start: int, remove_title: bool) -> tuple[int, int, int, int]:
    working = mask.copy()
    if remove_title:
        working[:design_start] = False
    points = np.argwhere(working)
    if not len(points):
        fail("la limpieza dejó una referencia vacía")
    top, left = points.min(axis=0)
    bottom, right = points.max(axis=0) + 1
    return int(left), int(top), int(right), int(bottom)


def clean_reference(path: Path) -> dict[str, object]:
    with Image.open(path) as source:
        source.load()
        original_size = source.size
        image = source.convert("RGB")
    mask = visual_mask(image)
    analysis = analyze(mask)
    box = content_box(mask, int(analysis["designStart"]), bool(analysis["hasTitle"]))
    crop = image.crop(box)
    width, height = original_size
    padding = max(12, round(min(width, height) * CANVAS_PADDING_RATIO))
    scale = min((width - padding * 2) / crop.width, (height - padding * 2) / crop.height)
    target = (max(1, round(crop.width * scale)), max(1, round(crop.height * scale)))
    resized = crop.resize(target, Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", original_size, "white")
    position = ((width - target[0]) // 2, (height - target[1]) // 2)
    canvas.paste(resized, position)

    with tempfile.NamedTemporaryFile(suffix=".webp", dir=path.parent, delete=False) as temporary:
        temporary_path = Path(temporary.name)
    try:
        canvas.save(temporary_path, "WEBP", quality=WEBP_QUALITY, method=6)
        os.replace(temporary_path, path)
    finally:
        temporary_path.unlink(missing_ok=True)

    return {
        "file": path.relative_to(ROOT).as_posix(),
        "titleRemoved": bool(analysis["hasTitle"]),
        "sourceBox": list(box),
        "targetSize": list(target),
        "scale": round(scale, 4),
        "bytes": path.stat().st_size,
    }


def check_reference(path: Path) -> dict[str, object]:
    with Image.open(path) as image:
        if image.format != "WEBP" or image.size != (1440, 1080):
            fail(f"referencia inválida: {path.relative_to(ROOT)} {image.format} {image.size}")
        image.load()
        analysis = analyze(visual_mask(image))
    if analysis["hasTitle"]:
        fail(f"título superior todavía detectable: {path.relative_to(ROOT)}")
    return {"file": path.relative_to(ROOT).as_posix(), "bytes": path.stat().st_size}


def main() -> None:
    parser = argparse.ArgumentParser(description="Limpia títulos repetidos y maximiza las referencias sin deformarlas.")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--apply", action="store_true", help="Procesa en sitio las referencias declaradas en el JSON.")
    mode.add_argument("--check", action="store_true", help="Valida formato, dimensiones y ausencia de título superior.")
    args = parser.parse_args()

    paths = reference_paths()
    if len(paths) != 85 or len(paths) != len(set(paths)):
        fail(f"se esperaban 85 rutas de referencia únicas y se encontraron {len(paths)}")
    missing = [path for path in paths if not path.is_file()]
    if missing:
        fail(f"faltan referencias: {[path.relative_to(ROOT).as_posix() for path in missing[:5]]}")

    records = [clean_reference(path) if args.apply else check_reference(path) for path in paths]
    result = {
        "status": "ok",
        "mode": "apply" if args.apply else "check",
        "references": len(records),
        "titlesRemoved": sum(bool(record.get("titleRemoved")) for record in records),
        "megabytes": round(sum(int(record["bytes"]) for record in records) / 1024 / 1024, 2),
        "records": records,
    }
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
