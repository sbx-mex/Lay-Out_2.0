from pathlib import Path
import os
from PIL import Image, ImageEnhance, ImageFilter, ImageOps
import json, math, re

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(os.environ.get('LAYOUT_SOURCE', ROOT / 'source' / 'Lay Out_2.0'))
OUT = ROOT / 'assets' / 'stations'
TECH = ROOT / 'assets' / 'technical'
OUT.mkdir(parents=True, exist_ok=True)
TECH.mkdir(parents=True, exist_ok=True)

# Individual source pages that contain one large station rendering.
PAGES = {
    'mop': [
        ('MOP 01-01', 3), ('MOP 03-02', 4), ('MOP 04-02', 5), ('MOP 06-02', 6),
        ('MOP 03-01', 7), ('MOP 04-01', 8), ('MOP 06-01', 9),
    ],
    'brewing': [
        ('BRW 03-02', 13), ('BRW 01-02', 14), ('BUN 02-02', 15), ('SRV 01-01', 16),
        ('BRW 11-01', 17), ('BRW 09-05', 18), ('BRW 05-06', 19), ('BRW 03-06', 20), ('WST 09', 21),
    ],
    'coldbar': [
        ('CBE 01-05', 26), ('CBE 03-01', 27), ('BLEND 01-03', 28), ('TEA 01-04', 29),
        ('CBE 05-03', 30), ('CBE 07-03', 31), ('CBE 09-01', 32), ('CBE 11-01', 33),
        ('CBS 01-02', 36), ('CBS 03-01', 37), ('CBS 05-01', 38), ('CBS 09-01', 39),
        ('CBS 11-02', 40), ('CBS 13-02', 41), ('CBS 15-01', 42),
    ],
    'condiments': [
        ('Condiment Cart - 3 Drop', 47), ('Condiment Cart 01-02', 48), ('Condiment Cart Single', 49), ('Condiment Cart 03-02', 50),
    ],
    'espresso': [('ESP 01-02', 55)],
}

ESP_OVERVIEW_53 = [
    'ESP 01-02','ESP 03-02','ESP 05-02','ESP 06-01',
    'ESP 07-03','ESP 10-01','ESP 11-01','ESP 03-04',
    'ESP 05-04','ESP 09-04','ESP 21-04','ESP 25-03',
]
ESP_OVERVIEW_54 = ['ESP 43-02','ESP 08-02','ESP 09-03','ESP 31-04']

TECHNICAL = [
    ('mop-componentes', 10, 'Lista de equipo y utensilios · Pedidos móviles'),
    ('brewing-componentes', 22, 'Lista de equipo y utensilios · Brewing'),
    ('coldbar-cbe-equipo', 34, 'Equipo y utensilios · Barra fría CBE'),
    ('coldbar-cbe-ingredientes', 35, 'Ingredientes · Barra fría CBE'),
    ('coldbar-cbs-equipo', 43, 'Equipo y utensilios · Barra fría CBS'),
    ('coldbar-cbs-ingredientes', 44, 'Ingredientes · Barra fría CBS'),
    ('condimentos-componentes', 51, 'Lista de componentes · Condimentos'),
]

def slug(code: str) -> str:
    return re.sub(r'[^a-z0-9]+', '-', code.lower()).strip('-')

def load_page(num: int) -> Image.Image:
    return Image.open(SOURCE / f'Lay Out_2.0_{num}.jpg').convert('RGB')

def enhance(img: Image.Image, sharp=1.35, contrast=1.035) -> Image.Image:
    img = ImageEnhance.Contrast(img).enhance(contrast)
    img = ImageEnhance.Sharpness(img).enhance(sharp)
    return img

def find_render_bbox(img: Image.Image):
    # Restrict search to the rendering area, excluding titles, notes, and copyright strips.
    import numpy as np
    arr = np.asarray(img)
    h, w, _ = arr.shape
    x0, y0, x1, y1 = int(w*0.035), int(h*0.20), int(w*0.965), int(h*0.87)
    roi = arr[y0:y1, x0:x1]
    # Rendering is significantly darker/more saturated than the white paper.
    mx = roi.max(axis=2)
    mn = roi.min(axis=2)
    sat = mx - mn
    gray = roi.mean(axis=2)
    mask = (gray < 222) | (sat > 28)
    ys, xs = np.where(mask)
    if len(xs) < 100:
        return (x0, y0, x1, y1)
    # Robust percentiles remove isolated text/noise.
    left = int(np.percentile(xs, 1.5)) + x0
    right = int(np.percentile(xs, 98.5)) + x0
    top = int(np.percentile(ys, 1.5)) + y0
    bottom = int(np.percentile(ys, 98.5)) + y0
    pad_x = max(16, int((right-left)*0.06))
    pad_y = max(16, int((bottom-top)*0.08))
    return (max(0,left-pad_x), max(y0,top-pad_y), min(w,right+pad_x), min(y1,bottom+pad_y))

def studio_canvas(crop: Image.Image, size=(1600, 1100)) -> Image.Image:
    crop = enhance(crop)
    crop.thumbnail((size[0]-120, size[1]-120), Image.Resampling.LANCZOS)
    canvas = Image.new('RGB', size, 'white')
    x = (size[0]-crop.width)//2
    y = (size[1]-crop.height)//2
    canvas.paste(crop, (x,y))
    return canvas

def save_variant(group: str, code: str, img: Image.Image, source: str, source_page: int):
    folder = OUT / group
    folder.mkdir(parents=True, exist_ok=True)
    name = slug(code)
    full = folder / f'{name}.webp'
    thumb = folder / f'{name}.thumb.webp'
    img.save(full, 'WEBP', quality=91, method=6)
    t = img.copy(); t.thumbnail((520, 360), Image.Resampling.LANCZOS)
    t.save(thumb, 'WEBP', quality=84, method=6)
    return {
        'code': code,
        'image': full.relative_to(ROOT).as_posix(),
        'thumb': thumb.relative_to(ROOT).as_posix(),
        'source': source,
        'sourcePage': source_page,
    }

records = {k: [] for k in PAGES}
# Use individual pages for all available full-detail variants.
for group, items in PAGES.items():
    for code, page in items:
        img = load_page(page)
        bbox = find_render_bbox(img)
        crop = img.crop(bbox)
        canvas = studio_canvas(crop)
        records[group].append(save_variant(group, code, canvas, f'Lay Out_2.0_{page}.jpg', page))

# Espresso variants: split the two overview grids. ESP 01-02 is replaced by the full page above.
def overview_crops(page, codes, rows):
    img = load_page(page)
    w,h = img.size
    cols = 4
    # Label bands are intentionally excluded; the UI displays the code in Spanish context.
    col_edges = [48, 288, 528, 768, 1010]
    if page == 53:
        row_boxes = [(214, 358), (408, 552), (602, 735)]
    else:
        row_boxes = [(214, 365)]
    out=[]
    for i, code in enumerate(codes):
        r=i//cols; c=i%cols
        x0,x1=col_edges[c],col_edges[c+1]
        y0,y1=row_boxes[r]
        crop=img.crop((x0,y0,x1,y1))
        # Remove near-white padding within each cell.
        import numpy as np
        a=np.asarray(crop)
        gray=a.mean(axis=2); sat=a.max(axis=2)-a.min(axis=2)
        mask=(gray<230)|(sat>22)
        ys,xs=np.where(mask)
        if len(xs)>20:
            l=max(0,int(xs.min())-8); rr=min(crop.width,int(xs.max())+9)
            t=max(0,int(ys.min())-8); b=min(crop.height,int(ys.max())+9)
            crop=crop.crop((l,t,rr,b))
        crop=crop.resize((crop.width*3,crop.height*3),Image.Resampling.LANCZOS)
        crop=enhance(crop, sharp=1.55, contrast=1.05)
        out.append((code, studio_canvas(crop), page))
    return out

# Preserve the higher-detail ESP 01-02 generated from page 55.
existing = {x['code']:x for x in records['espresso']}
for code, canvas, page in overview_crops(53, ESP_OVERVIEW_53, 3) + overview_crops(54, ESP_OVERVIEW_54, 1):
    if code in existing:
        continue
    records['espresso'].append(save_variant('espresso', code, canvas, f'Lay Out_2.0_{page}.jpg (recorte de opciones)', page))

# Technical pages: preserve full technical context but sharpen/readjust for screen viewing.
technical_records=[]
for key,page,label in TECHNICAL:
    img=enhance(load_page(page), sharp=1.25, contrast=1.03)
    img=img.resize((1584,1224),Image.Resampling.LANCZOS)
    path=TECH/f'{key}.webp'
    img.save(path,'WEBP',quality=90,method=6)
    technical_records.append({'key':key,'label':label,'image':path.relative_to(ROOT).as_posix(),'sourcePage':page})

# Espresso technical crops from the bottom of page 54.
p54=load_page(54)
for key,label,box in [
    ('espresso-equipo','Equipo y utensilios · Espresso',(525,545,770,740)),
    ('espresso-ingredientes','Ingredientes · Espresso',(770,545,1010,740)),
]:
    crop=p54.crop(box).resize((1200,900),Image.Resampling.LANCZOS)
    canvas=studio_canvas(crop,(1400,1000))
    path=TECH/f'{key}.webp'; canvas.save(path,'WEBP',quality=90,method=6)
    technical_records.append({'key':key,'label':label,'image':path.relative_to(ROOT).as_posix(),'sourcePage':54})

manifest={'variants':records,'technical':technical_records}
(ROOT/'data'/'asset-build.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:len(v) for k,v in records.items()},ensure_ascii=False))
print(f"technical={len(technical_records)}")
