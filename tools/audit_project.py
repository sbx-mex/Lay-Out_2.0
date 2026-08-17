from pathlib import Path
from PIL import Image
import hashlib
import json
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
ERRORS = []
WARNINGS = []

REQUIRED = [
    'index.html', 'styles.css', 'app.js', 'sw.js', 'manifest.json',
    'data/layouts.json', 'vendor/jspdf.umd.min.js'
]


def require(path: str) -> Path:
    target = ROOT / path
    if not target.is_file():
        ERRORS.append(f'Falta archivo: {path}')
    return target


def read_text(path: str) -> str:
    target = require(path)
    return target.read_text(encoding='utf-8') if target.is_file() else ''


for item in REQUIRED:
    require(item)

try:
    catalog = json.loads((ROOT / 'data/layouts.json').read_text(encoding='utf-8'))
except Exception as exc:
    ERRORS.append(f'layouts.json inválido: {exc}')
    catalog = {'stations': []}

stations = catalog.get('stations', [])
if len(stations) != 5:
    ERRORS.append(f'La taxonomía actual debe contener 5 estaciones; se encontraron {len(stations)}')

required_station_ids = {'mop', 'brewing', 'coldbar', 'condiments', 'espresso'}
found_station_ids = {station.get('id') for station in stations}
if found_station_ids != required_station_ids:
    ERRORS.append(f'Estaciones inesperadas: {sorted(found_station_ids)}')

variants = [(station, variant) for station in stations for variant in station.get('variants', [])]
if not variants:
    ERRORS.append('El catálogo no contiene configuraciones')

codes = [variant.get('code') for _, variant in variants]
if any(not code for code in codes):
    ERRORS.append('Hay configuraciones sin código')
if len(codes) != len(set(codes)):
    ERRORS.append('Hay códigos de configuración duplicados')

# El código técnico se conserva; el contexto visible debe ser digerible en español.
for station in stations:
    for field in ('label', 'short', 'description', 'translation'):
        if not str(station.get(field, '')).strip():
            ERRORS.append(f'{station.get("id")}: falta texto visible en {field}')
    tips = station.get('tips', [])
    if not 2 <= len(tips) <= 4:
        WARNINGS.append(f'{station.get("id")}: conviene mantener entre 2 y 4 puntos de validación')

# Assets: resolución, consistencia de fondo y relación entre imagen completa/miniatura.
full_files = []
thumb_files = []
for station, variant in variants:
    code = variant.get('code', 'SIN CÓDIGO')
    for key in ('image', 'thumb'):
        rel = variant.get(key, '')
        target = ROOT / rel
        if not target.is_file():
            ERRORS.append(f'Falta {key} para {code}: {rel}')
            continue
        try:
            image = Image.open(target)
            width, height = image.size
            if key == 'image':
                full_files.append(target)
                if width < 1200 or height < 800:
                    WARNINGS.append(f'{code}: imagen principal menor a 1200x800 ({width}x{height})')
                rgb = image.convert('RGB')
                points = [
                    rgb.getpixel((3, 3)), rgb.getpixel((width - 4, 3)),
                    rgb.getpixel((3, height - 4)), rgb.getpixel((width - 4, height - 4))
                ]
                if min(sum(pixel) / 3 for pixel in points) < 235:
                    WARNINGS.append(f'{code}: el fondo de las esquinas no es blanco uniforme')
            else:
                thumb_files.append(target)
                if width > 600 or height > 450:
                    WARNINGS.append(f'{code}: miniatura demasiado grande ({width}x{height})')
        except Exception as exc:
            ERRORS.append(f'No se puede leer {target.relative_to(ROOT)}: {exc}')

for station in stations:
    for technical in station.get('technical', []):
        rel = technical.get('image', '')
        target = ROOT / rel
        if not target.is_file():
            ERRORS.append(f'Falta vista técnica {technical.get("label")}: {rel}')
            continue
        try:
            width, height = Image.open(target).size
            if width < 1000 or height < 700:
                WARNINGS.append(f'Vista técnica con resolución baja: {rel} ({width}x{height})')
        except Exception as exc:
            ERRORS.append(f'No se puede leer vista técnica {rel}: {exc}')

# Detecta duplicados accidentales entre imágenes principales.
hashes = {}
for target in full_files:
    digest = hashlib.sha256(target.read_bytes()).hexdigest()
    hashes.setdefault(digest, []).append(target)
duplicate_groups = [items for items in hashes.values() if len(items) > 1]
if duplicate_groups:
    WARNINGS.append(f'Hay {len(duplicate_groups)} grupos de imágenes principales idénticas')

html = read_text('index.html')
css = read_text('styles.css')
js = read_text('app.js')
sw = read_text('sw.js')
workflow = (ROOT / '.github/workflows/validate.yml').read_text(encoding='utf-8') if (ROOT / '.github/workflows/validate.yml').is_file() else ''
builder = (ROOT / 'tools/build_assets.py').read_text(encoding='utf-8') if (ROOT / 'tools/build_assets.py').is_file() else ''

# UX / accesibilidad / una sola pestaña.
if '<html lang="es-MX">' not in html:
    ERRORS.append('El documento debe declarar lang="es-MX"')
if html.count('<main') != 1:
    ERRORS.append('La experiencia debe conservar un solo <main>')
for required_id in ('stationNav', 'searchInput', 'searchResults', 'variantRail', 'referenceImage', 'cameraInput', 'evidenceInput', 'exportButton', 'exportStatus'):
    if f'id="{required_id}"' not in html:
        ERRORS.append(f'Falta control de interfaz: #{required_id}')

# Verifica que los IDs estáticos usados con $("id") existan en HTML.
referenced_ids = set(re.findall(r'\$\(["\']([^"\']+)["\']\)', js))
html_ids = set(re.findall(r'id=["\']([^"\']+)["\']', html))
missing_ids = sorted(referenced_ids - html_ids)
if missing_ids:
    ERRORS.append(f'app.js referencia IDs inexistentes: {", ".join(missing_ids)}')

# Exportación alineada a V1: A4 vertical, una página, imágenes sin deformar y margen seguro.
css_flat = re.sub(r'\s+', '', css)
if '@page{size:A4portrait;margin:12mm}' not in css_flat:
    ERRORS.append('La impresión debe usar A4 vertical con margen de 12 mm')
for marker, message in [
    ('const PDF_MARGIN = 12;', 'Falta margen PDF de 12 mm'),
    ('orientation: "portrait"', 'La exportación PDF debe conservar orientación vertical como V1'),
    ('function pdfGeometry(', 'Falta ajuste dinámico del PDF según orientación de la evidencia'),
    ('function drawPdfImageContain(', 'Falta ajuste proporcional de imágenes en PDF'),
    ('pdf.internal.getNumberOfPages() !== 1', 'Falta protección de PDF de una sola página'),
    ('window.confirm(', 'Falta confirmación cuando la evidencia está incompleta'),
]:
    if marker not in js:
        ERRORS.append(message)

# Navegación intuitiva y captura de evidencia.
for marker, message in [
    ('function showSearchResults(', 'Falta buscador global por código'),
    ('function selectSearchResult(', 'Falta navegación directa desde búsqueda'),
    ('cameraInput', 'Falta captura directa desde cámara'),
    ('evidenceInput', 'Falta opción de adjuntar desde galería/archivo'),
    ('function bindSwipe(', 'Falta navegación táctil entre referencias'),
    ('notes: $("notes").value', 'Las notas no se conservan en el estado local'),
]:
    if marker not in js:
        ERRORS.append(message)

# PWA/offline: el catálogo completo debe poder quedar disponible después de instalar/cargar.
if 'layout-2-remaster-v2' not in sw:
    ERRORS.append('Versión de caché PWA desactualizada')
if 'async function catalogAssets()' not in sw:
    ERRORS.append('El service worker no precarga los assets del catálogo')
for shell in ('index.html', 'styles.css', 'app.js', 'manifest.json', 'data/layouts.json', 'vendor/jspdf.umd.min.js'):
    if shell not in sw:
        ERRORS.append(f'PWA no incluye {shell}')

# CI: evita que una corrección llegue al repositorio con JS o auditoría rotos.
for marker in ('node --check app.js', 'node --check sw.js', 'python tools/audit_project.py'):
    if marker not in workflow:
        ERRORS.append(f'Workflow incompleto: falta {marker}')

# Herramienta de reconstrucción: debe explicar cómo aportar la fuente en un repo limpio.
if builder and ('argparse' not in builder or '--source' not in builder):
    WARNINGS.append('build_assets.py todavía depende de una ruta implícita; conviene aceptar --source')

report = {
    'status': 'passed' if not ERRORS else 'failed',
    'stations': len(stations),
    'variants': len(variants),
    'fullImages': len(full_files),
    'thumbImages': len(thumb_files),
    'technicalViews': sum(len(station.get('technical', [])) for station in stations),
    'print': {'format': 'A4', 'orientation': 'portrait', 'marginMm': 12, 'maxPages': 1},
    'checks': {
        'globalSearch': 'function showSearchResults(' in js,
        'cameraAndGallery': 'cameraInput' in js and 'evidenceInput' in js,
        'adaptivePdf': 'function pdfGeometry(' in js,
        'offlineCatalog': 'async function catalogAssets()' in sw,
    },
    'errors': ERRORS,
    'warnings': WARNINGS,
}
(ROOT / 'data/audit_report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report, ensure_ascii=False, indent=2))
sys.exit(1 if ERRORS else 0)
