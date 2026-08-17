from pathlib import Path
from PIL import Image
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = ROOT.parent if (ROOT / 'index.html').exists() else ROOT
FULL_PROJECT = PROJECT_ROOT if (PROJECT_ROOT / 'data' / 'layouts.json').exists() else None

report = {
    'status': 'reviewed',
    'focus': [
        'Vista principal más amplia',
        'Zoom interactivo para referencias y evidencia',
        'Recorte inteligente para ganar visibilidad',
        'Interfaz más intuitiva en español',
        'Compatibilidad con exportación A4 vertical V1'
    ],
    'patchFiles': [
        'index.html',
        'styles.css',
        'app.js',
        'data/audit_report.json',
        'tools/audit_project.py'
    ],
    'validatedWithPython': {},
    'warnings': []
}

if FULL_PROJECT:
    layouts = json.loads((FULL_PROJECT / 'data' / 'layouts.json').read_text(encoding='utf-8'))
    stations = layouts.get('stations', [])
    report['validatedWithPython']['stations'] = len(stations)
    report['validatedWithPython']['variants'] = sum(len(s.get('variants', [])) for s in stations)
    report['validatedWithPython']['technicalViews'] = sum(len(s.get('technical', [])) for s in stations)
    asset_files = list((FULL_PROJECT / 'assets').rglob('*.*')) if (FULL_PROJECT / 'assets').exists() else []
    image_files = [p for p in asset_files if p.suffix.lower() in {'.png', '.jpg', '.jpeg', '.webp'}]
    report['validatedWithPython']['assetImages'] = len(image_files)
    sampled = []
    for path in image_files[:10]:
        try:
            with Image.open(path) as im:
                sampled.append({'file': str(path.relative_to(FULL_PROJECT)), 'size': list(im.size)})
        except Exception as exc:
            report['warnings'].append(f'No se pudo leer {path.name}: {exc}')
    report['validatedWithPython']['sampledImages'] = sampled

matrena_zip = Path('/mnt/data/Matrena 1 y 2.zip')
if matrena_zip.exists():
    report['validatedWithPython']['matrenaZipDetected'] = True
    report['validatedWithPython']['matrenaSource'] = matrena_zip.name

(ROOT / 'data' / 'audit_report.json').write_text(
    json.dumps(report, ensure_ascii=False, indent=2) + '\n',
    encoding='utf-8'
)
print(json.dumps(report, ensure_ascii=False, indent=2))
sys.exit(0)
