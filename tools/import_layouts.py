from __future__ import annotations

import argparse
import json
import re
import shutil
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter, ImageOps


ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = ROOT / "assets" / "layouts"


def slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


STATIONS = [
    {
        "id": "brewing", "label": "Café", "short": "Café", "icon": "◉",
        "description": "Elige el acomodo que coincide con tu barra de café.",
        "translation": "Compara equipo, tarjas y flujo de izquierda a derecha.",
        "tips": ["Ubica el equipo principal.", "Compara tarjas y superficies.", "Confirma el código."],
        "subgroupLabels": {"Brewing": "Brewing"},
    },
    {
        "id": "coldbar", "label": "Barra fría", "short": "Barra fría", "icon": "◇",
        "description": "Filtra la familia y compara la forma de la barra.",
        "translation": "Primero elige CBE/Blend/Tea o CBS; después el código.",
        "tips": ["Elige la familia.", "Compara módulos y geometría.", "Confirma ingredientes y equipo."],
        "subgroupLabels": {"CBE": "CBE / Blend / Tea", "CBS": "CBS"},
    },
    {
        "id": "condiments", "label": "Condimentos", "short": "Condimentos", "icon": "◫",
        "description": "Selecciona el carro que corresponde a tu tienda.",
        "translation": "Compara número de módulos y orientación.",
        "tips": ["Cuenta los módulos.", "Valida orientación.", "Confirma contenedores."],
        "subgroupLabels": {"Condimentos": "Carros"},
    },
    {
        "id": "drive-thru", "label": "Drive Thru", "short": "Drive Thru", "icon": "↗",
        "description": "Compara la estación de entrega y apoyo.",
        "translation": "Elige el código que más se parece a la estación real.",
        "tips": ["Ubica entrega y cobro.", "Compara superficies.", "Confirma el código."],
        "subgroupLabels": {"Drive Thru": "Drive Thru"},
    },
    {
        "id": "espresso", "label": "Espresso", "short": "Espresso", "icon": "◆",
        "description": "Elige primero el modelo de Mastrena.",
        "translation": "Mastrena I y Mastrena II se muestran por separado, aunque repitan código.",
        "tips": ["Filtra Mastrena I o II.", "Compara el acomodo completo.", "Confirma el código."],
        "subgroupLabels": {"Mastrena I": "Mastrena I", "Mastrena II": "Mastrena II"},
    },
    {
        "id": "mop", "label": "Pedidos móviles", "short": "MOP", "icon": "▣",
        "description": "Selecciona el módulo de pedidos móviles.",
        "translation": "Compara ancho, módulos y zona de entrega.",
        "tips": ["Cuenta los módulos.", "Ubica la entrega.", "Confirma el código."],
        "subgroupLabels": {"MOP": "MOP"},
    },
    {
        "id": "warming", "label": "Hornos", "short": "Hornos", "icon": "▤",
        "description": "Elige primero el modelo de horno.",
        "translation": "Merrychef E2S aparece primero; TurboChef NGO después.",
        "tips": ["Filtra el horno.", "Compara ancho y cantidad.", "Confirma el código."],
        "subgroupLabels": {"Merrychef E2S": "Merrychef E2S", "TurboChef NGO": "TurboChef NGO"},
    },
]


LAYOUT_GROUPS = [
    ("brewing", "Brewing", range(1, 10), ["BUN 02-02", "BRW 01-02", "BUN 02-02", "SRV 01-01", "BRW 11-01", "BRW 09-05", "BRW 05-06", "BRW 03-06", "WST 09"]),
    ("coldbar", "CBE", range(11, 19), ["CBE 01-05", "CBE 03-01", "BLD 01-03", "TEA 01-04", "CBE 05-03", "CBE 07-03", "CBE 09-01", "CBE 11-01"]),
    ("coldbar", "CBS", range(21, 27), ["CBS 01-02", "CBS 03-01", "CBS 05-01", "CBS 11-02", "CBS 13-02", "CBS 15-01"]),
    ("condiments", "Condimentos", range(29, 33), ["3 Drop", "01-02", "Single", "03-02"]),
    ("drive-thru", "Drive Thru", range(34, 37), ["DT 01-01", "DT 35-01", "DT 05-02"]),
    ("espresso", "Mastrena I", range(38, 54), ["ESP 01-02", "ESP 03-02", "ESP 05-02", "ESP 06-01", "ESP 07-03", "ESP 10-01", "ESP 11-01", "ESP 03-04", "ESP 05-04", "ESP 09-04", "ESP 21-04", "ESP 25-03", "ESP 43-02", "ESP 08-02", "ESP 09-03", "ESP 31-04"]),
    ("espresso", "Mastrena II", range(56, 72), ["ESP 01-02", "ESP 03-02", "ESP 05-02", "ESP 06-01", "ESP 07-03", "ESP 10-01", "ESP 11-01", "ESP 03-04", "ESP 05-04", "ESP 09-04", "ESP 21-04", "ESP 25-03", "ESP 43-02", "ESP 08-02", "ESP 09-03", "ESP 31-04"]),
    ("mop", "MOP", range(74, 81), ["MOP 01-01", "MOP 03-02", "MOP 04-02", "MOP 06-02", "MOP 03-01", "MOP 04-01", "MOP 06-01"]),
    ("warming", "Merrychef E2S", range(82, 90), ["WRM 03-01 · 60 Dual", "WRM 05-01 · 75 Dual", "WRM 07-01 · 90 Dual", "WRM 09-01 · 90 Triple", "WRM 01-01 · 30 Single", "WRM 02-02 · 45 Single", "WRM 07-01 · 46 Single", "WRM 03-01 · 60 Go Cart"]),
    ("warming", "TurboChef NGO", range(92, 100), ["WRM 03-01 · 60 Dual", "WRM 05-01 · 75 Dual", "WRM 07-01 · 90 Dual", "WRM 09-01 · 90 Triple", "WRM 01-01 · 30 Single", "WRM 02-02 · 45 Single", "WRM 07-01 · 46 Single", "WRM 03-01 · 60 Go Cart"]),
]


TECHNICAL = [
    (10, "brewing", "Brewing", "Equipo y utensilios"),
    (19, "coldbar", "CBE", "Equipo y utensilios"),
    (20, "coldbar", "CBE", "Ingredientes"),
    (27, "coldbar", "CBS", "Equipo y utensilios"),
    (28, "coldbar", "CBS", "Ingredientes"),
    (33, "condiments", "Condimentos", "Equipo y utensilios"),
    (37, "drive-thru", "Drive Thru", "Equipo y utensilios"),
    (54, "espresso", "Mastrena I", "Equipo y utensilios"),
    (55, "espresso", "Mastrena I", "Ingredientes"),
    (72, "espresso", "Mastrena II", "Equipo y utensilios"),
    (73, "espresso", "Mastrena II", "Ingredientes"),
    (81, "mop", "MOP", "Equipo y utensilios"),
    (90, "warming", "Merrychef E2S", "Equipo y utensilios"),
    (91, "warming", "Merrychef E2S", "Alimentos"),
    (100, "warming", "TurboChef NGO", "Equipo y utensilios"),
    (101, "warming", "TurboChef NGO", "Alimentos"),
]


def source_file(source: Path, page: int) -> Path:
    return source / f"Lay Out 2.0 Base_{page}.jpg"


def output_path(page: int, station: str, subgroup: str, label: str) -> Path:
    lot = "lote-01" if page <= 99 else "lote-02"
    name = f"{page:03d}-{slug(station)}-{slug(subgroup)}-{slug(label)}.webp"
    return ASSET_ROOT / lot / name


def convert_image(source: Path, target: Path) -> None:
    with Image.open(source) as opened:
        image = ImageOps.exif_transpose(opened).convert("RGB")
        image = ImageEnhance.Contrast(image).enhance(1.035)
        image = image.resize((1440, 1080), Image.Resampling.LANCZOS)
        image = image.filter(ImageFilter.UnsharpMask(radius=0.8, percent=85, threshold=3))
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_suffix(".tmp")
        image.save(temporary, "WEBP", quality=88, method=4)
        with Image.open(temporary) as check:
            check.verify()
        temporary.replace(target)


def build(source: Path) -> dict:
    if not source.is_dir():
        raise SystemExit(f"No existe la carpeta fuente: {source}")
    missing = [page for page in range(1, 102) if not source_file(source, page).exists()]
    if missing:
        raise SystemExit(f"Faltan imágenes fuente: {missing}")

    if ASSET_ROOT.exists():
        shutil.rmtree(ASSET_ROOT)

    stations = {item["id"]: {**item, "variants": [], "technical": []} for item in STATIONS}
    used_pages: set[int] = set()

    for station_id, subgroup, pages, labels in LAYOUT_GROUPS:
        for page, label in zip(pages, labels, strict=True):
            target = output_path(page, station_id, subgroup, label)
            convert_image(source_file(source, page), target)
            item_id = f"{station_id}-{slug(subgroup)}-{slug(label)}-p{page:03d}"
            stations[station_id]["variants"].append({
                "id": item_id,
                "code": label,
                "label": label,
                "subgroup": subgroup,
                "equipment": subgroup if station_id in {"espresso", "warming"} else "",
                "image": target.relative_to(ROOT).as_posix(),
                "thumb": target.relative_to(ROOT).as_posix(),
                "source": f"Lay Out 2.0 Base_{page}.jpg",
                "sourceOrder": page,
            })
            used_pages.add(page)

    for page, station_id, subgroup, label in TECHNICAL:
        target = output_path(page, station_id, subgroup, label)
        convert_image(source_file(source, page), target)
        stations[station_id]["technical"].append({
            "key": f"{station_id}-{slug(subgroup)}-{slug(label)}-p{page:03d}",
            "label": label,
            "subgroup": subgroup,
            "image": target.relative_to(ROOT).as_posix(),
            "sourceOrder": page,
        })
        used_pages.add(page)

    if used_pages != set(range(1, 102)):
        raise SystemExit(f"Mapeo incompleto. Páginas sin usar: {sorted(set(range(1, 102)) - used_pages)}")

    catalog = {
        "schemaVersion": "3.0.0",
        "project": "Lay Out 2.0",
        "language": "es-MX",
        "updated": "2026-08-21",
        "sourceNote": "Orden basado en Station Layout Guides - Orden. Imágenes exclusivamente de Lay Out 2.0 Nuevas Imagenes.",
        "stations": [stations[item["id"]] for item in STATIONS],
    }
    (ROOT / "data" / "layouts.json").write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return catalog


def main() -> None:
    parser = argparse.ArgumentParser(description="Importa las 101 imágenes nuevas de Lay Out 2.0.")
    parser.add_argument("--source", required=True, type=Path, help="Carpeta con Lay Out 2.0 Base_1.jpg a Base_101.jpg")
    args = parser.parse_args()
    catalog = build(args.source)
    variants = sum(len(item["variants"]) for item in catalog["stations"])
    technical = sum(len(item["technical"]) for item in catalog["stations"])
    print(json.dumps({"stations": len(catalog["stations"]), "variants": variants, "technical": technical, "images": variants + technical}))


if __name__ == "__main__":
    main()
