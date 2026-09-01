# Games — memoria operativa

## Producto

Editor y motor web de aventuras gráficas 2D declarativas. El preview ejecuta el mismo
modelo YAML, runtime y renderer del juego. El frontend vive en `games/frontend`; no
depende de rutas absolutas ni del frontend de `cabezudo.dev`.

## Git

- Repositorio: `/home/esteban/Documents/games`.
- Rama permanente del proyecto: `games`.
- Rama integrada/publicable: `main`.
- Cada tarea se implementa en `games`, se verifica, se integra con `main` mediante
  fast-forward cuando sea posible y después se publican ambas referencias.
- No usar ramas temporales, rebase, force push, reset destructivo, stash ni clean.
- Los ZIP de revisión son artefactos untracked y nunca se agregan al índice.

## Estado confirmado

- TAREA 55: la mesa del ejemplo es un scene object con approach, panel de objetos
  cercanos y acción explícita `Mirar` que inicia `table_look`.
- TAREA 56: `hotspots[].approach.facing` es opcional y se normaliza como `null` cuando
  falta. Si existe, sólo admite orientaciones soportadas por el actor controlado.
- El facing declarado se aplica únicamente después de completar la ruta y validar que
  el hotspot u objeto sigue disponible; ocurre antes del panel, efectos o diálogo.
- Hotspots sin facing conservan la orientación derivada del movimiento.
- Actor interactions, navegación libre y patrol no usan `approach.facing`.

## Contratos vigentes

- Coordenadas del actor: `position.x` es el centro horizontal de los pies y
  `position.y` es la vertical de los pies, siempre en world coordinates.
- Modos de facing: 1 (`default`), 2 (`left`, `right`), 4 y 8 direcciones según
  `actor-facing.js`.
- `motion` continúa limitado a `idle | walking`; talking es un override visual.
- Flags booleanas son mutables; flags calculadas `and/or` son de sólo lectura.
- Scene objects derivan disponibilidad de elemento visible y hotspot habilitado.
- Las acciones de objetos se resuelven nuevamente contra modelo y estado antes de
  ejecutarse.
- `proximity` no pertenece al DSL vigente.

## Operación

- Pruebas frontend: `cd frontend && npm test`.
- Build: `cd frontend && npm run build`.
- Pruebas del empaquetador: `scripts/test-package-games-sources.sh`.
- ZIP: `scripts/package-games-sources.sh`; archivos nuevos deben estar en Git y
  declararse explícitamente con `--files games/...`.
- El empaquetador nunca ejecuta `git add` ni incorpora untracked implícitamente.

## Última verificación útil

TAREA 56: pruebas focales y suite completa, build Vite, pruebas del empaquetador,
`git diff --check`, verificación manual en Chrome, integración `games` → `main`, ZIP
de revisión y sincronización remota de ambas ramas.

No hubo despliegue a producción.
