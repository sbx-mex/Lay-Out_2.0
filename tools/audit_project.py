from __future__ import annotations

import hashlib
import json
import re
from html.parser import HTMLParser
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = ROOT / "data" / "layouts.json"
ASSET_ROOT = ROOT / "assets" / "layouts"
UI_ASSET_ROOT = ROOT / "assets" / "ui"
UI_ASSETS = ("Damos_Seguimiento.webp", "Un_placer_haber_Ayudado.webp")
MAX_FILES = 99
MAX_BYTES = 25 * 1024 * 1024


def fail(message: str) -> None:
    raise SystemExit(f"ERROR: {message}")


class IdAuditParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.ids: list[str] = []
        self.label_targets: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        if attributes.get("id"):
            self.ids.append(str(attributes["id"]))
        if tag == "label" and attributes.get("for"):
            self.label_targets.append(str(attributes["for"]))


if not (ROOT / "tools" / "audit_pdf_export.py").is_file():
    fail("falta el auditor de exportación PDF")
if not (ROOT / "tools" / "clean_reference_titles.py").is_file():
    fail("falta el limpiador validable de títulos de referencia")
app_source = (ROOT / "app.js").read_text(encoding="utf-8")
html_source = (ROOT / "index.html").read_text(encoding="utf-8")
styles_source = (ROOT / "styles.css").read_text(encoding="utf-8")
service_worker_source = (ROOT / "sw.js").read_text(encoding="utf-8")
if 'const CACHE = "layout-2-remastered-v13";' not in service_worker_source:
    fail("actualiza la versión de caché para distribuir la nueva exportación PDF")
for marker in ("networkFirst", "staleWhileRevalidate"):
    if marker not in service_worker_source:
        fail(f"falta estrategia de actualización rápida: {marker}")
for marker in (
    "evidenceMeta",
    "useLandscapePage",
    "setExportBusy",
    "waitForInterfacePaint",
    "PDF_COLORS",
    "pendingPhotoInputId",
    "activeCampaignId",
    "renderCampaignSelect",
    "renderStationSelect",
    "renderVariantPosition",
    "renderExperience",
    "renderStationChecklist",
    "continueStationChecklist",
    "stationChecklistItems",
    "prefetchAdjacentVariants",
    "animateReferenceChange",
    "bindSwipe",
    "stationDisplayLabel",
):
    if marker not in app_source:
        fail(f"falta función premium de exportación: {marker}")
for marker in (
    "campaignSelect",
    "stationSelect",
    "selectionSummary",
    "carouselHint",
    "carouselProgress",
    "captureGuidance",
    "stationChecklistDialog",
    "stationChecklistProgress",
    "stationChecklistAction",
    "photoOrientationDialog",
    "exportProgress",
    "exportCompleteDialog",
):
    if marker not in html_source:
        fail(f"falta interfaz ejecutiva: {marker}")
for obsolete in ('id="stationNav"', 'id="variantRail"', 'class="variant-card"'):
    if obsolete in html_source:
        fail(f"interfaz redundante todavía visible: {obsolete}")
for obsolete in ('id="workflowNav"', 'class="workflow-nav"'):
    if obsolete in html_source:
        fail(f"flujo superior confuso todavía visible: {obsolete}")
for obsolete in ('id="searchInput"', 'id="searchResults"', 'Buscar estación, equipo o código', 'La fotografía se procesa localmente'):
    if obsolete in html_source:
        fail(f"mensaje o control retirado todavía visible: {obsolete}")
for obsolete in (
    "7 estaciones · 10 rutas de equipo · 85 configuraciones",
    "101 referencias nuevas",
    "Starbucks Layouts · Herramienta operativa · Uso interno",
    "Revisa tu Lay Out paso a paso.",
    "Ruta rápida",
):
    if obsolete in html_source:
        fail(f"texto retirado todavía visible: {obsolete}")
for obsolete in ('id="variantSelect"', 'id="referenceStage"', 'id="referenceImage"', 'En palabras simples'):
    if obsolete in html_source:
        fail(f"vista teórica duplicada todavía visible: {obsolete}")
for marker in (".capture-guidance", ".checklist-dialog", ".station-checklist", ".checklist-item", ".orientation-dialog", ".export-progress", ".completion-dialog", ".carousel-progress", ".is-dragging"):
    if marker not in styles_source:
        fail(f"falta estilo ejecutivo: {marker}")
for marker in ('event.key === "ArrowLeft"', 'navigator.vibrate', 'Math.abs(deltaX) > Math.abs(deltaY) * 1.25', 'suppressReferenceClickUntil'):
    if marker not in app_source:
        fail(f"falta mejora de navegación del carrete: {marker}")
for marker in ("LayOut 2.0 · Estamos mejorando para ti", "Diseñado por Jorge Alcantar Aguiar &amp; Enrique César Flores"):
    if marker not in html_source:
        fail(f"falta pie de página solicitado: {marker}")

parser = IdAuditParser()
parser.feed(html_source)
duplicate_ids = sorted({item for item in parser.ids if parser.ids.count(item) > 1})
if duplicate_ids:
    fail(f"IDs HTML duplicados: {duplicate_ids}")
missing_label_targets = sorted(set(parser.label_targets) - set(parser.ids))
if missing_label_targets:
    fail(f"labels sin control asociado: {missing_label_targets}")
js_required_ids = set(re.findall(r'\$\("([A-Za-z][A-Za-z0-9_-]*)"\)', app_source))
missing_js_ids = sorted(js_required_ids - set(parser.ids))
if missing_js_ids:
    fail(f"app.js usa controles inexistentes: {missing_js_ids}")
for marker in ('id="compareWorkspace"', 'id="compareReference"', 'id="prevButton"', 'id="nextButton"', 'id="variantPosition"'):
    if marker not in html_source:
        fail(f"falta navegación directa en el comparador: {marker}")
if 'return `${current.label} _ ${current.subgroupLabels?.[subgroup] || subgroup}`;' not in app_source:
    fail("la estación no diferencia el equipo con el formato Estación _ Equipo")


catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
experience = catalog.get("experience", {})
workflow = experience.get("workflow", [])
performance = catalog.get("performance", {})
campaigns = catalog.get("campaigns", [])
stations = catalog.get("stations", [])
variants = [variant for station in stations for variant in station.get("variants", [])]
technical = [item for station in stations for item in station.get("technical", [])]
records = variants + technical

if catalog.get("schemaVersion") != "3.2.0" or workflow:
    fail("el JSON todavía conserva el flujo superior retirado")
if experience.get("campaignChecklist") != "Insumos y materiales actualizados a la campaña seleccionada.":
    fail("falta la validación transversal de campaña")
if performance.get("precachePerStation") != 1 or performance.get("referenceDisplayMode") != "native":
    fail("la configuración de rendimiento debe usar carga nativa y una precarga por estación")
if performance.get("adjacentPrefetch") != 1 or performance.get("swipeThreshold") != 48:
    fail("el JSON no contiene la configuración estable del carrete")
expected_cleanup = {
    "version": 1,
    "references": 85,
    "titlesRemoved": 69,
    "canvas": "1440x1080",
    "fit": "contain-max",
}
if performance.get("referenceCleanup") != expected_cleanup:
    fail("el JSON no documenta la limpieza y ajuste dinámico de referencias")
if "priorityCatalogAssets" not in service_worker_source or ".slice(0, limit)" not in service_worker_source:
    fail("el service worker todavía no limita la precarga de referencias")

expected_campaigns = ["WINTER", "SPRING", "SUMMER", "SUMMER II", "FALL", "XMAS"]
if [item.get("id") for item in campaigns] != expected_campaigns:
    fail("las campañas anuales no coinciden con Layout 1")
if len(stations) != 7:
    fail(f"se esperaban 7 estaciones y se encontraron {len(stations)}")
expected_checklist_sizes = {
    "brewing": 3,
    "coldbar": 4,
    "condiments": 3,
    "drive-thru": 3,
    "espresso": 3,
    "mop": 3,
    "warming": 3,
}
for current in stations:
    checklist = current.get("checklist", [])
    expected_size = expected_checklist_sizes.get(current.get("id"))
    if expected_size is None or len(checklist) != expected_size:
        fail(f"checklist operativo incompleto en {current.get('id')}: {len(checklist)}")
    if any(not isinstance(item, str) or len(item.strip()) < 12 for item in checklist):
        fail(f"checklist inválido en {current.get('id')}")
if html_source.index('id="stationChecklistDialog"') > html_source.index('id="photoOrientationDialog"'):
    fail("el checklist debe aparecer antes de la recomendación de orientación")
if len(variants) != 85 or len(technical) != 16 or len(records) != 101:
    fail(f"conteo inválido: {len(variants)} acomodos + {len(technical)} técnicas")

variant_ids = [item.get("id") for item in variants]
if len(variant_ids) != len(set(variant_ids)):
    fail("hay IDs de acomodo duplicados")

paths = [item.get("image") for item in records]
if len(paths) != len(set(paths)):
    fail("hay rutas de imagen duplicadas")

required_equipment = {
    "espresso": {"Mastrena I", "Mastrena II"},
    "warming": {"Merrychef E2S", "TurboChef NGO"},
}
for station_id, expected in required_equipment.items():
    current = next((item for item in stations if item.get("id") == station_id), None)
    if not current:
        fail(f"falta estación con equipos diferenciados: {station_id}")
    actual = {item.get("subgroup") for item in current.get("variants", [])}
    if actual != expected:
        fail(f"equipos incorrectos en {station_id}: {sorted(actual)}")

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

for name in UI_ASSETS:
    path = UI_ASSET_ROOT / name
    if not path.is_file():
        fail(f"falta imagen de experiencia: {name}")
    with Image.open(path) as image:
        if image.format != "WEBP" or image.size != (768, 512):
            fail(f"imagen de experiencia inválida: {name} {image.format} {image.size}")
        image.verify()
    if path.stat().st_size > 250 * 1024:
        fail(f"imagen de experiencia demasiado pesada: {name}")

report = {
    "status": "ok",
    "stations": len(stations),
    "campaigns": len(campaigns),
    "variants": len(variants),
    "technical": len(technical),
    "images": len(records),
    "premiumPdf": {
        "adaptiveOrientation": True,
        "horizontalCaptureGuidance": True,
        "exportProgress": True,
        "stationChecklistFirst": True,
        "orientationAfterChecklist": True,
        "completionDialog": True,
        "warmStarbucksPalette": True,
        "optimizedUiAssets": len(UI_ASSETS),
        "fastCacheRefresh": True,
        "stationEquipmentDropdown": True,
        "referenceDropdown": False,
        "singleReferenceWorkspace": True,
        "thumbnailDuplicationRemoved": True,
        "singleLinePdfHeader": True,
        "jsonDrivenChecklist": True,
        "nativeReferenceRendering": True,
        "priorityPrecachePerStation": performance["precachePerStation"],
        "swipeCarousel": True,
        "keyboardCarousel": True,
        "adjacentImagePrefetch": True,
        "carouselProgress": True,
        "gestureAxisProtection": True,
        "cleanReferenceTitles": True,
        "dynamicReferenceFit": True,
        "cleanedReferences": performance["referenceCleanup"]["references"],
        "embeddedTitlesRemoved": performance["referenceCleanup"]["titlesRemoved"],
    },
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
