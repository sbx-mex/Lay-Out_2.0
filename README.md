# Lay Out 2.0

Remaster del proyecto de referencia `layout-main`, enfocado exclusivamente en **una pestaña de Lay Out** y en las nuevas estaciones incluidas en `Lay Out_2.0`.

## Qué cambia

- Una sola experiencia: estación → código → referencia → evidencia → PDF.
- 5 estaciones agrupadas: Pedidos móviles, Brewing, Barra fría, Condimentos y Espresso.
- 51 configuraciones visuales separadas y enfocadas.
- Barra fría concentra CBE / Blend / Tea y CBS en una misma estación con filtros.
- Las matrices de Espresso se dividieron en opciones individuales para evitar revisar láminas saturadas.
- Navegación y contexto en español; los códigos y nomenclatura técnica se conservan.
- Imágenes recortadas al contenido útil, fondo blanco, realce de nitidez y miniaturas optimizadas.
- Vistas técnicas separadas del catálogo principal para no repetir información.
- Exportación PDF A4 horizontal de una sola página, con margen seguro de 12 mm.
- PWA sin dependencias remotas; las imágenes se cachean a demanda.

## Estructura

- `data/layouts.json`: catálogo único de estaciones y variantes.
- `assets/stations/`: imágenes optimizadas y miniaturas.
- `assets/technical/`: listas/equipamiento que aportan contexto técnico.
- `tools/build_assets.py`: lógica de recorte, mejora y separación de variantes.
- `tools/audit_project.py`: auditoría de estructura, imágenes, impresión y referencias.

## Validación

```bash
node --check app.js
node --check sw.js
python tools/audit_project.py
```

## Publicación

El contenido de esta carpeta puede cargarse directamente a un repositorio nuevo y publicarse con GitHub Pages.

### Regenerar imágenes desde la fuente

Los 55 originales no se duplican dentro del repositorio final. Si necesitas reconstruir los recortes, coloca la carpeta original en `source/Lay Out_2.0/` o define `LAYOUT_SOURCE` y ejecuta:

```bash
LAYOUT_SOURCE="/ruta/Lay Out_2.0" python tools/build_assets.py
```

El workflow `.github/workflows/validate.yml` valida automáticamente JavaScript, estructura e imágenes en cada push o pull request.
