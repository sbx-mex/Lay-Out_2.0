#!/usr/bin/env python3
"""Optimiza y valida las imágenes cálidas del flujo de exportación."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageChops, ImageOps


ROOT = Path(__file__).resolve().parents[1]
TARGET_DIR = ROOT / "assets" / "ui"
ASSETS = ("Damos_Seguimiento.webp", "Un_placer_haber_Ayudado.webp")
TARGET_SIZE = (768, 512)
WARM_BACKGROUND = (247, 243, 234)


def fail(message: str) -> None:
    raise SystemExit(f"ERROR: {message}")


def content_box(image: Image.Image) -> tuple[int, int, int, int]:
    rgb = image.convert("RGB")
    black = Image.new("RGB", rgb.size, (0, 0, 0))
    difference = ImageChops.difference(rgb, black).convert("L")
    mask = difference.point(lambda value: 255 if value > 24 else 0)
    box = mask.getbbox()
    if not box:
        fail("la imagen no contiene elementos visibles")
    left, top, right, bottom = box
    padding = 4
    return (
        max(0, left - padding),
        max(0, top - padding),
        min(rgb.width, right + padding),
        min(rgb.height, bottom + padding),
    )


def optimize(source: Path, destination: Path) -> dict[str, object]:
    with Image.open(source) as opened:
        image = ImageOps.exif_transpose(opened).convert("RGB")
    cropped = image.crop(content_box(image))
    fitted = ImageOps.contain(cropped, (748, 492), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", TARGET_SIZE, WARM_BACKGROUND)
    x = (TARGET_SIZE[0] - fitted.width) // 2
    y = (TARGET_SIZE[1] - fitted.height) // 2
    canvas.paste(fitted, (x, y))
    destination.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(destination, "WEBP", quality=91, method=6)
    return {
        "file": destination.relative_to(ROOT).as_posix(),
        "sourceSize": list(image.size),
        "contentSize": list(cropped.size),
        "outputSize": list(canvas.size),
        "bytes": destination.stat().st_size,
    }


def validate(path: Path) -> dict[str, object]:
    if not path.is_file():
        fail(f"falta {path.relative_to(ROOT).as_posix()}")
    with Image.open(path) as image:
        if image.format != "WEBP":
            fail(f"formato inválido: {path.name}")
        if image.size != TARGET_SIZE:
            fail(f"dimensiones inválidas en {path.name}: {image.size}")
        rgb = image.convert("RGB")
        corners = (rgb.getpixel((0, 0)), rgb.getpixel((767, 0)), rgb.getpixel((0, 511)), rgb.getpixel((767, 511)))
    if any(max(pixel) < 45 for pixel in corners):
        fail(f"{path.name} conserva bordes negros")
    if path.stat().st_size > 250 * 1024:
        fail(f"{path.name} supera 250 KB")
    return {
        "file": path.relative_to(ROOT).as_posix(),
        "format": "WEBP",
        "size": list(TARGET_SIZE),
        "bytes": path.stat().st_size,
        "warmCorners": True,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    if not args.check:
        if not args.source_dir:
            fail("indica --source-dir para optimizar los originales")
        optimized = []
        for name in ASSETS:
            source = args.source_dir / name
            if not source.is_file():
                fail(f"falta el original {source}")
            optimized.append(optimize(source, TARGET_DIR / name))
    else:
        optimized = []

    validated = [validate(TARGET_DIR / name) for name in ASSETS]
    print(json.dumps({"status": "ok", "optimized": optimized, "validated": validated}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
