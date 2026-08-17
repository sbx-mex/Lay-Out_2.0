from pathlib import Path
from PIL import Image
import json, re, hashlib, sys
ROOT=Path(__file__).resolve().parents[1]
errors=[]; warnings=[]

def need(path):
    p=ROOT/path
    if not p.is_file(): errors.append(f'Falta archivo: {path}')
    return p
for f in ['index.html','styles.css','app.js','sw.js','manifest.json','data/layouts.json','vendor/jspdf.umd.min.js']:
    need(f)

try: catalog=json.loads((ROOT/'data/layouts.json').read_text(encoding='utf-8'))
except Exception as e: errors.append(f'layouts.json inválido: {e}'); catalog={'stations':[]}

stations=catalog.get('stations',[])
if len(stations)!=5: errors.append(f'Se esperaban 5 estaciones y hay {len(stations)}')
variants=[(s,v) for s in stations for v in s.get('variants',[])]
if len(variants)!=51: errors.append(f'Se esperaban 51 configuraciones y hay {len(variants)}')
codes=[v.get('code') for _,v in variants]
if len(codes)!=len(set(codes)): errors.append('Hay códigos de variante duplicados')

seen=[]
for s,v in variants:
    for key in ('image','thumb'):
        p=ROOT/v.get(key,'')
        if not p.is_file(): errors.append(f'Falta {key} para {v.get("code")}: {v.get(key)}'); continue
        seen.append(p)
        try:
            im=Image.open(p)
            w,h=im.size
            if key=='image' and (w<1200 or h<800): warnings.append(f'{v["code"]}: imagen principal menor a objetivo ({w}x{h})')
            if key=='thumb' and (w>600 or h>450): warnings.append(f'{v["code"]}: miniatura demasiado grande ({w}x{h})')
            # white-background validation: corners should be very light for catalog consistency
            rgb=im.convert('RGB'); pts=[rgb.getpixel((3,3)),rgb.getpixel((w-4,3)),rgb.getpixel((3,h-4)),rgb.getpixel((w-4,h-4))]
            if key=='image' and min(sum(pix)/3 for pix in pts)<235: warnings.append(f'{v["code"]}: fondo de esquina no es blanco uniforme')
        except Exception as e: errors.append(f'No se puede leer imagen {p.relative_to(ROOT)}: {e}')

for s in stations:
    for t in s.get('technical',[]):
        p=ROOT/t.get('image','')
        if not p.is_file(): errors.append(f'Falta vista técnica {t.get("label")}: {t.get("image")}')

html=(ROOT/'index.html').read_text(encoding='utf-8') if (ROOT/'index.html').is_file() else ''
css=(ROOT/'styles.css').read_text(encoding='utf-8') if (ROOT/'styles.css').is_file() else ''
js=(ROOT/'app.js').read_text(encoding='utf-8') if (ROOT/'app.js').is_file() else ''
sw=(ROOT/'sw.js').read_text(encoding='utf-8') if (ROOT/'sw.js').is_file() else ''

if '<html lang="es">' not in html: errors.append('Falta lang=es')
if html.count('<main')!=1: errors.append('La experiencia debe conservar un solo main/pestaña')
if 'tool-switch' in html or 'Mejora Operativa' in html: errors.append('Persisten componentes de la segunda herramienta del proyecto espejo')
if '@page{size:A4 landscape;margin:12mm}' not in css.replace('\n',''): errors.append('No se preservó el margen de impresión A4 de 12 mm')
if 'pdf.internal.getNumberOfPages()!==1' not in js: errors.append('Falta protección de PDF de una sola página')
if 'window.jspdf' not in js: errors.append('No se usa jsPDF local')
if 'serviceWorker.register("sw.js")' not in js: errors.append('Falta registro del service worker')
if 'layout-2-remaster-v1' not in sw: errors.append('Versión de caché PWA incorrecta')
for shell in ['index.html','styles.css','app.js','manifest.json','data/layouts.json','vendor/jspdf.umd.min.js']:
    if shell not in sw: errors.append(f'PWA no incluye {shell}')

# File hashes to identify accidental duplicates among full-size variant outputs.
hashes={}
for p in [ROOT/v['image'] for _,v in variants if (ROOT/v['image']).is_file()]:
    h=hashlib.sha256(p.read_bytes()).hexdigest(); hashes.setdefault(h,[]).append(p)
dup=[ps for ps in hashes.values() if len(ps)>1]
if dup: warnings.append(f'Hay {len(dup)} grupos de imágenes idénticas entre variantes')

report={
 'status':'passed' if not errors else 'failed',
 'stations':len(stations),'variants':len(variants),
 'fullImages':sum(1 for _,v in variants if (ROOT/v['image']).is_file()),
 'thumbImages':sum(1 for _,v in variants if (ROOT/v['thumb']).is_file()),
 'technicalViews':sum(len(s.get('technical',[])) for s in stations),
 'errors':errors,'warnings':warnings,
}
(ROOT/'data/audit_report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
sys.exit(1 if errors else 0)
