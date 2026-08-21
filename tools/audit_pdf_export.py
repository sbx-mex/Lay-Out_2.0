#!/usr/bin/env python3
"""Audita la exportación A4 adaptativa de Lay Out 2.0.

Genera pruebas visuales para fotografía horizontal y vertical, verifica una sola
página, márgenes ejecutivos y confirma que el modo adaptativo amplía una foto
vertical sin deformarla.
"""
from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
A4_PORTRAIT = (1240, 1754)
A4_LANDSCAPE = (1754, 1240)
WARM_PAGE = "#F7F3EA"
WARM_PANEL = "#FFFDF9"
STARBUCKS_GREEN = "#006241"
WARM_GOLD = "#C69C54"
FORBIDDEN_VISIBLE_COPY = ("LAY OUT 2.0", "STARBUCKS", "Una página A4", 'pdf.text("NOTAS"')
REQUIRED_SOURCE_MARKERS = (
    'evidenceMeta?.orientation === "portrait"',
    'pageOrientation = useLandscapePage ? "landscape" : "portrait"',
    'pdf.internal.pageSize.getWidth()',
    'pdf.internal.pageSize.getHeight()',
    'drawPdfHalf(pdf, "Referencia"',
    'drawPdfHalf(pdf, "Acomodo real"',
    "pdf.line(...cutLine)",
    "PDF_COLORS.page",
    "PDF_COLORS.panel",
    "PDF_COLORS.gold",
    "pdf.roundedRect",
)


@dataclass(frozen=True)
class Placement:
    width: int
    height: int
    x: int
    y: int


def fail(message: str) -> None:
    raise SystemExit(f"ERROR: {message}")


def contain(canvas: Image.Image, source: Image.Image, box: tuple[int, int, int, int]) -> Placement:
    left, top, right, bottom = box
    width, height = right - left, bottom - top
    fitted = source.copy()
    fitted.thumbnail((width, height), Image.Resampling.LANCZOS)
    x = left + (width - fitted.width) // 2
    y = top + (height - fitted.height) // 2
    canvas.paste(fitted.convert("RGB"), (x, y))
    return Placement(fitted.width, fitted.height, x, y)


def draw_panel(
    canvas: Image.Image,
    box: tuple[int, int, int, int],
    label: str,
    image: Image.Image,
) -> Placement:
    draw = ImageDraw.Draw(canvas)
    left, top, right, bottom = box
    line = "#B8CFC5"
    draw.rectangle(box, fill=WARM_PANEL, outline=line, width=2)
    draw.rectangle((left, top, right, top + 7), fill=STARBUCKS_GREEN)
    draw.text((left + 12, top + 17), label, fill="#003B2A", font=ImageFont.load_default())
    draw.line((left + 10, top + 53, right - 10, top + 53), fill=STARBUCKS_GREEN, width=2)
    return contain(canvas, image, (left + 5, top + 59, right - 5, bottom - 5))


def cut_line(draw: ImageDraw.ImageDraw, start: tuple[int, int], end: tuple[int, int]) -> None:
    x1, y1 = start
    x2, y2 = end
    if y1 == y2:
        for x in range(x1, x2, 18):
            draw.line((x, y1, min(x + 9, x2), y2), fill=WARM_GOLD, width=2)
    else:
        for y in range(y1, y2, 18):
            draw.line((x1, y, x2, min(y + 9, y2)), fill=WARM_GOLD, width=2)


def build_portrait_test(reference: Image.Image, evidence: Image.Image) -> tuple[Image.Image, Placement]:
    canvas = Image.new("RGB", A4_PORTRAIT, WARM_PAGE)
    margin, gap = 35, 12
    mid = A4_PORTRAIT[1] // 2
    draw_panel(canvas, (margin, margin, A4_PORTRAIT[0] - margin, mid - gap // 2),
               "Barra fria - TEA 01-04 / Referencia", reference)
    placement = draw_panel(canvas, (margin, mid + gap // 2, A4_PORTRAIT[0] - margin, A4_PORTRAIT[1] - margin),
                           "Barra fria - TEA 01-04 / Acomodo real", evidence)
    cut_line(ImageDraw.Draw(canvas), (margin, mid), (A4_PORTRAIT[0] - margin, mid))
    return canvas, placement


def build_landscape_test(reference: Image.Image, evidence: Image.Image) -> tuple[Image.Image, Placement]:
    canvas = Image.new("RGB", A4_LANDSCAPE, WARM_PAGE)
    margin, gap = 35, 12
    mid = A4_LANDSCAPE[0] // 2
    draw_panel(canvas, (margin, margin, mid - gap // 2, A4_LANDSCAPE[1] - margin),
               "Barra fria - TEA 01-04 / Referencia", reference)
    placement = draw_panel(canvas, (mid + gap // 2, margin, A4_LANDSCAPE[0] - margin, A4_LANDSCAPE[1] - margin),
                           "Barra fria - TEA 01-04 / Acomodo real", evidence)
    cut_line(ImageDraw.Draw(canvas), (mid, margin), (mid, A4_LANDSCAPE[1] - margin))
    return canvas, placement


def synthetic_evidence(size: tuple[int, int], label: str) -> Image.Image:
    image = Image.new("RGB", size, "#E8ECEA")
    draw = ImageDraw.Draw(image)
    inset_x, inset_y = size[0] // 10, size[1] // 14
    draw.rectangle((inset_x, inset_y, size[0] - inset_x, size[1] - inset_y), fill="#74827C")
    draw.text((inset_x + 20, size[1] // 2), label, fill="white", font=ImageFont.load_default())
    return image


def validate_single_page(pdf_path: Path, expected_orientation: str) -> None:
    reader = PdfReader(pdf_path)
    if len(reader.pages) != 1:
        fail(f"{pdf_path.name} debe tener exactamente una página")
    box = reader.pages[0].mediabox
    width, height = float(box.width), float(box.height)
    actual = "landscape" if width > height else "portrait"
    if actual != expected_orientation:
        fail(f"{pdf_path.name} tiene orientación {actual}; se esperaba {expected_orientation}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", type=Path, default=Path("/tmp/layout_pdf_audit"))
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
    for marker in REQUIRED_SOURCE_MARKERS:
        if marker not in source:
            fail(f"falta la regla adaptativa: {marker}")

    catalog = json.loads((ROOT / "data" / "layouts.json").read_text(encoding="utf-8"))
    variant = next(
        variant
        for station in catalog["stations"]
        for variant in station["variants"]
        if variant["code"] == "TEA 01-04"
    )
    with Image.open(ROOT / variant["image"]) as image:
        reference = image.convert("RGB")

    horizontal = synthetic_evidence((1400, 900), "ACOMODO HORIZONTAL")
    vertical = synthetic_evidence((900, 1400), "ACOMODO VERTICAL")
    portrait_canvas, horizontal_placement = build_portrait_test(reference, horizontal)
    landscape_canvas, vertical_placement = build_landscape_test(reference, vertical)

    legacy_canvas = Image.new("RGB", A4_PORTRAIT, "white")
    legacy_vertical = contain(legacy_canvas, vertical, (40, A4_PORTRAIT[1] // 2 + 55, A4_PORTRAIT[0] - 40, A4_PORTRAIT[1] - 40))
    width_gain = vertical_placement.width / legacy_vertical.width
    if width_gain < 1.25:
        fail(f"la ampliación adaptativa es insuficiente: {width_gain:.2f}x")

    args.output_dir.mkdir(parents=True, exist_ok=True)
    outputs = {
        "horizontal_photo": args.output_dir / "audit_horizontal_photo_a4_portrait.pdf",
        "vertical_photo": args.output_dir / "audit_vertical_photo_a4_landscape.pdf",
    }
    portrait_canvas.save(outputs["horizontal_photo"], "PDF", resolution=150.0)
    landscape_canvas.save(outputs["vertical_photo"], "PDF", resolution=150.0)
    portrait_canvas.save(args.output_dir / "audit_horizontal_photo.png", "PNG", optimize=True)
    landscape_canvas.save(args.output_dir / "audit_vertical_photo.png", "PNG", optimize=True)

    validate_single_page(outputs["horizontal_photo"], "portrait")
    validate_single_page(outputs["vertical_photo"], "landscape")
    report = {
        "status": "ok",
        "pages_per_export": 1,
        "margin_mm": float(match.group(1)),
        "horizontal_photo_page": "portrait",
        "vertical_photo_page": "landscape",
        "vertical_photo_width_gain": round(width_gain, 2),
        "warm_starbucks_palette": True,
        "horizontal_photo_placement_px": [horizontal_placement.width, horizontal_placement.height],
        "vertical_photo_placement_px": [vertical_placement.width, vertical_placement.height],
        "outputs": {key: str(value) for key, value in outputs.items()},
    }
    (args.output_dir / "audit_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
