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
if not (ROOT / "tools" / "calibrate_dm_infographic.py").is_file():
    fail("falta el calibrador de la infografía DM")
if not (ROOT / "tools" / "audit_dm_experience.py").is_file():
    fail("falta el auditor específico de la experiencia DM")
app_source = (ROOT / "app.js").read_text(encoding="utf-8")
dm_source = (ROOT / "dm-validation.js").read_text(encoding="utf-8")
html_source = (ROOT / "index.html").read_text(encoding="utf-8")
styles_source = (ROOT / "styles.css").read_text(encoding="utf-8")
dm_styles_source = (ROOT / "dm-validation.css").read_text(encoding="utf-8")
service_worker_source = (ROOT / "sw.js").read_text(encoding="utf-8")
workflow_source = (ROOT / ".github" / "workflows" / "validate.yml").read_text(encoding="utf-8")
if 'const CACHE = `${CACHE_PREFIX}v17`;' not in service_worker_source:
    fail("actualiza la versión de caché para distribuir la nueva versión")
for marker in ("networkFirst", "staleWhileRevalidate"):
    if marker not in service_worker_source:
        fail(f"falta estrategia de actualización rápida: {marker}")

# Seguridad y estabilidad: políticas del navegador, entradas acotadas y CI reproducible.
csp_match = re.search(
    r'<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"',
    html_source,
    flags=re.IGNORECASE,
)
if not csp_match:
    fail("falta Content-Security-Policy en index.html")
for directive in (
    "default-src 'self'",
    "script-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
):
    if directive not in csp_match.group(1):
        fail(f"Content-Security-Policy incompleta: {directive}")
if '<meta name="referrer" content="no-referrer">' not in html_source:
    fail("falta una política de referencia privada")

for link in re.findall(r'<a\b[^>]*\btarget="_blank"[^>]*>', html_source, flags=re.IGNORECASE):
    rel_match = re.search(r'\brel="([^"]+)"', link, flags=re.IGNORECASE)
    rel_values = set(rel_match.group(1).lower().split()) if rel_match else set()
    if not {"noopener", "noreferrer"}.issubset(rel_values):
        fail(f"enlace externo sin aislamiento completo: {link}")
for source in re.findall(r'<script\b[^>]*\bsrc="([^"]+)"', html_source, flags=re.IGNORECASE):
    if source.startswith(("http://", "https://", "//")):
        fail(f"script remoto no permitido: {source}")

for label, source in (("app.js", app_source), ("dm-validation.js", dm_source), ("sw.js", service_worker_source)):
    for forbidden in ("eval(", "new Function(", "document.write(", 'setTimeout("', 'setInterval("'):
        if forbidden in source:
            fail(f"{label} contiene ejecución dinámica no permitida: {forbidden}")
if 'document.querySelector(".app").innerHTML' in app_source:
    fail("el error principal no debe insertar mensajes mediante innerHTML")
for label, source in (("app.js", app_source), ("dm-validation.js", dm_source)):
    for marker in ("safeStorageSet", "FETCH_TIMEOUT_MS", "AbortController", "MAX_DECODE_PIXELS", "ALLOWED_EVIDENCE_TYPES"):
        if marker not in source:
            fail(f"{label} carece de protección de estabilidad: {marker}")
for marker in (
    "CACHE_PREFIX",
    "key.startsWith(CACHE_PREFIX)",
    'response.type === "basic"',
    'request.headers.has("range")',
    "fetchWithTimeout",
    "putSafely",
):
    if marker not in service_worker_source:
        fail(f"service worker sin aislamiento seguro: {marker}")
if html_source.count('accept="image/jpeg,image/png,image/webp"') != 2:
    fail("las entradas generales deben limitarse a formatos de imagen compatibles")
if dm_source.count('accept="image/jpeg,image/png,image/webp"') != 2:
    fail("las entradas DM deben limitarse a formatos de imagen compatibles")

action_refs = dict(re.findall(r"uses:\s+actions/([^@\s]+)@([0-9a-f]{40})", workflow_source))
if set(action_refs) != {"checkout", "setup-node", "setup-python"}:
    fail(f"las acciones oficiales deben fijarse por hash: {sorted(action_refs)}")
if "permissions:\n  contents: read" not in workflow_source or "persist-credentials: false" not in workflow_source:
    fail("el workflow no aplica privilegios mínimos")
for dependency in ("Pillow==12.3.0", "pypdf==6.10.0", "numpy==2.3.5", "scipy==1.17.0"):
    if dependency not in workflow_source:
        fail(f"dependencia Python sin versión fija: {dependency}")

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
    "ALWAYS_HIDDEN_STATION_IDS",
    "availableStations",
):
    if marker not in app_source:
        fail(f"falta función premium de exportación: {marker}")
for marker in (
    "openDmValidation",
    "renderDmStations",
    "processDmEvidence",
    "buildDmInfographic",
    "exportDmInfographic",
    "calibratedRowHeight",
    "drawAdjustedImage",
    "formatRegion",
    "preloadDmReferences",
    "scheduleDmPreload",
    "shiftDmVariant",
    "bindDmCarousel",
    "improvementHeight",
    "visibleDmStations",
    "dmChecklistItems",
    "productionChannelsChecklist",
    "dmxChecklistOverlay",
    "dmxOrientationError",
    "image.naturalHeight > image.naturalWidth",
    "fitCanvasFont",
    "Lay Out | Distrital |",
    "Exportar imagen HQ",
    "data/dm-infographic.json",
):
    if marker not in dm_source:
        fail(f"falta función independiente de Validación DM: {marker}")
for marker in ('id="dmValidationOpen"', 'id="dmValidationOpenMobile"', 'id="aboutButton"', 'id="aboutDialog"', 'dm-validation.css', 'dm-validation.js'):
    if marker not in html_source:
        fail(f"falta acceso independiente a Validación DM: {marker}")
for marker in (".dmx-shell", ".dmx-station", ".dmx-compare", ".dmx-columns", ".dmx-footer", ".dmx-flow", ".dmx-check", ".dmx-horizontal-rule"):
    if marker not in dm_styles_source:
        fail(f"falta estilo independiente de Validación DM: {marker}")
for marker in ('"dm-validation.css"', '"dm-validation.js"', '"data/dm-infographic.json"'):
    if marker not in service_worker_source:
        fail(f"Validación DM no está disponible sin conexión: {marker}")
for marker in ("dmValidationEntries", "renderDmValidation", "dmImageButton", "dmName", "dmQuickButton"):
    if marker in app_source:
        fail(f"Validación DM debe permanecer fuera del núcleo operativo: {marker}")
if "figcaption" in dm_source:
    fail("Referencia y Real deben aparecer una sola vez como encabezado global")
for obsolete in ('className = "dmx-variant"', 'select.setAttribute("aria-label", `Referencia'):
    if obsolete in dm_source:
        fail(f"Validación DM todavía usa una lista desplegable de referencias: {obsolete}")
for marker in ('id="dmxCamera"', 'capture="environment"', 'Tomar foto', 'Adjuntar', 'Mejora continua'):
    if marker not in dm_source:
        fail(f"falta acción rápida de Validación DM: {marker}")
for marker in (".dmx-carousel", ".dmx-carousel-progress", ".dmx-photo-actions", ".dmx-improvement"):
    if marker not in dm_styles_source:
        fail(f"falta estilo de carrete consolidado DM: {marker}")
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
    "aboutButton",
    "aboutDialog",
    "aboutContinue",
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
for marker in (".capture-guidance", ".checklist-dialog", ".station-checklist", ".checklist-item", ".orientation-dialog", ".export-progress", ".completion-dialog", ".carousel-progress", ".is-dragging", ".about-dialog", ".about-overview"):
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
dm_infographic = json.loads((ROOT / "data" / "dm-infographic.json").read_text(encoding="utf-8"))
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
if dm_infographic.get("version") != 2 or dm_infographic.get("canvasWidth", 0) < 2400:
    fail("la configuración premium de Validación DM no es válida")
if dm_infographic.get("columnHeaderHeight") != 0:
    fail("la exportación DM debe omitir la fila Referencia / Real")
if dm_infographic.get("imageQuality", 0) < 0.97:
    fail("la exportación DM no conserva calidad alta")
if dm_infographic.get("minPhotoHeight", 0) < 640 or not 780 <= dm_infographic.get("maxRowHeight", 0) <= 860:
    fail("la calibración DM no conserva fotografías amplias y proporcionales")
if not 72 <= dm_infographic.get("improvementHeight", 0) <= 120:
    fail("la altura dinámica de mejora continua no es válida")
if experience.get("campaignChecklist") != "Insumos y materiales actualizados a la campaña seleccionada.":
    fail("falta la validación transversal de campaña")
if experience.get("productionChannelsChecklist") != "Movimientos y trabajo alineados a los canales de producción, sin cruces innecesarios.":
    fail("falta la validación de movimientos y canales de producción")
if experience.get("hiddenStationIds") != ["mop"]:
    fail("Pedidos móviles debe permanecer oculto en toda la versión")
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
for marker in ('new Set(["mop"', "if (hidden.has(station.id)) continue"):
    if marker not in service_worker_source:
        fail(f"el service worker no excluye estaciones ocultas: {marker}")

expected_campaigns = ["WINTER", "SPRING", "SUMMER", "SUMMER II", "FALL", "XMAS"]
if [item.get("id") for item in campaigns] != expected_campaigns:
    fail("las campañas anuales no coinciden con Layout 1")
if len(stations) != 7:
    fail(f"se esperaban 7 estaciones y se encontraron {len(stations)}")
visible_stations = [station for station in stations if station.get("id") not in set(experience["hiddenStationIds"])]
core_stations = [station for station in visible_stations if station.get("id") != "drive-thru"]
if len(core_stations) != 5 or len(visible_stations) != 6:
    fail(f"la experiencia debe mostrar 5 estaciones Core y 6 con DT: {len(core_stations)}/{len(visible_stations)}")
if "Pedidos móviles" in html_source or "Pedidos móviles" in dm_source:
    fail("Pedidos móviles reapareció en la interfaz")
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
    "visibleStations": len(visible_stations),
    "coreStations": len(core_stations),
    "hiddenStations": experience["hiddenStationIds"],
    "campaigns": len(campaigns),
    "variants": len(variants),
    "technical": len(technical),
    "images": len(records),
    "security": {
        "contentSecurityPolicy": True,
        "restrictedImageTypes": True,
        "boundedImageDecode": True,
        "safeStorageFallback": True,
        "isolatedServiceWorkerCache": True,
        "pinnedActions": len(action_refs),
        "pinnedPythonDependencies": 4,
    },
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
        "aboutDialog": True,
        "dmQuestionnairePerStation": True,
        "dmHorizontalEvidenceOnly": True,
        "dmProductionChannelsValidation": True,
        "dmCanvasWidth": dm_infographic["canvasWidth"],
        "dmImageQuality": dm_infographic["imageQuality"],
        "dmRedundantColumnHeaders": False,
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
