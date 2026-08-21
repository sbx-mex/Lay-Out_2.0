# Lay Out 2.0

Guía visual por estación con 101 referencias nuevas en WebP.

## Orden y filtros

1. Café
2. Barra fría
3. Condimentos
4. Drive Thru
5. Espresso: Mastrena I → Mastrena II
6. Pedidos móviles
7. Hornos: Merrychef E2S → TurboChef NGO

Los códigos originales se conservan. Las versiones de equipo se identifican por separado, incluso cuando el código se repite.

## Imágenes

- `assets/layouts/lote-01/`: 99 imágenes.
- `assets/layouts/lote-02/`: 2 imágenes.
- Cada carpeta permanece debajo de 99 archivos y 25 MB.
- `Station Layout Guides - Orden` sólo define la secuencia.
- Las imágenes publicadas provienen únicamente de `Lay Out 2.0 Nuevas Imagenes`.

## Validar

```bash
node --check app.js
node --check sw.js
python tools/cleanup_assets.py
python tools/audit_project.py
```

El workflow `Validar Lay Out 2.0` revisa formato, rutas, duplicados, orden y límites. El workflow manual `Borrar imágenes obsoletas` elimina y publica cualquier imagen de catálogo que ya no esté referenciada.

## Reimportar

```bash
python tools/import_layouts.py --source "/ruta/Lay Out 2.0 Nuevas Imagenes"
```
