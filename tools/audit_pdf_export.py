#!/usr/bin/env python3
"""Audita la plantilla PDF y genera una prueba A4 de dos mitades recortables."""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
A4_150_DPI = (1240, 1754)
FORBIDDEN_VISIBLE_COPY = ("LAY OUT 2.0", "STARBUCKS", "Una página A4", 'pdf.text("NOTAS"')


def fail(message: str) -> None:
    raise SystemExit(f"ERROR: {message}")


def contain(canvas: Image.Image, source: Image.Image, box: tuple[int, int, int, int]) -> None:
    left, top, right, bottom = box
    width, height = right - left, bottom - top
    fitted = source.copy()
    fitted.thumbnail((width, height), Image.Resampling.LANCZOS)
    x = left + (width - fitted.width) // 2
    y = top + (height - fitted.height) // 2
    canvas.paste(fitted.convert("RGB"), (x, y))


def draw_half(canvas: Image.Image, box: tuple[int, int, int, int], label: str, image: Image.Image) -> None:
    draw = ImageDraw.Draw(canvas)
    left, top, right, bottom = box
    green, line = "#006241", "#BED8CC"
    draw.rectangle(box, outline=line, width=2)
    draw.text((left + 12, top + 11), label, fill=green, font=ImageFont.load_default())
    draw.line((left + 10, top + 48, right - 10, top + 48), fill=green, width=2)
    contain(canvas, image, (left + 5, top + 54, right - 5, bottom - 5))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=Path("/tmp/layout_export_audit.pdf"))
    args = parser.parse_args()

    source = (ROOT / "app.js").read_text(encoding="utf-8")
    match = re.search(r"const PDF_MARGIN = (\d+(?:\.\d+)?);", source)
    if not match or float(match.group(1)) > 6:
        fail("el margen PDF debe ser de 6 mm o menos")
    if "const PDF_CUT_GAP = 2;" not in source:
        fail("falta el espacio central de corte de 2 mm")
    build = source[source.index("async function buildLayoutExportDocument"):source.index("async function exportPdf")]
    for text in FORBIDDEN_VISIBLE_COPY:
        if text in build:
            fail(f"texto global prohibido en PDF: {text}")
    for required in ('drawPdfHalf(pdf, "Referencia"', 'drawPdfHalf(pdf, "Acomodo real"', "H / 2"):
        if required not in build:
            fail(f"falta estructura recortable: {required}")

    catalog = json.loads((ROOT / "data" / "layouts.json").read_text(encoding="utf-8"))
    variant = next(
        variant
        for station in catalog["stations"]
        for variant in station["variants"]
        if variant["code"] == "TEA 01-04"
    )
    with Image.open(ROOT / variant["image"]) as reference:
        reference_image = reference.convert("RGB")
    evidence = Image.new("RGB", (900, 1400), "#E8ECEA")
    evidence_draw = ImageDraw.Draw(evidence)
    evidence_draw.rectangle((110, 90, 790, 1310), fill="#74827C")
    evidence_draw.text((330, 680), "ACOMODO REAL", fill="white", font=ImageFont.load_default())

    canvas = Image.new("RGB", A4_150_DPI, "white")
    margin, gap = 35, 12
    mid = A4_150_DPI[1] // 2
    draw_half(canvas, (margin, margin, A4_150_DPI[0] - margin, mid - gap // 2),
              "Barra fria · TEA 01-04 / Referencia   |   Tienda: Prueba   |   Fecha: 21 ago 2026", reference_image)
    draw_half(canvas, (margin, mid + gap // 2, A4_150_DPI[0] - margin, A4_150_DPI[1] - margin),
              "Barra fria · TEA 01-04 / Acomodo real   |   Tienda: Prueba   |   Fecha: 21 ago 2026", evidence)
    cut = ImageDraw.Draw(canvas)
    for x in range(margin, A4_150_DPI[0] - margin, 18):
        cut.line((x, mid, min(x + 9, A4_150_DPI[0] - margin), mid), fill="#82918B", width=1)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(args.output, "PDF", resolution=150.0)
    pdf_bytes = args.output.read_bytes()
    if len(re.findall(rb"/Type\s*/Page\b", pdf_bytes)) != 1:
        fail("la prueba no es una sola página")
    print(json.dumps({"status": "ok", "pages": 1, "margin_mm": float(match.group(1)), "output": str(args.output)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
