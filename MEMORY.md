# Games — memoria operativa

## Producto y criterio de evolución

Games es un engine y editor web declarativo para aventuras gráficas 2D
point-and-click. El engine ejecuta reglas y cada aventura aporta datos y contenido,
principalmente YAML, SVG, imágenes, audio y otros assets. El preview del editor usa el
mismo modelo, runtime y renderer del juego; no es una simulación separada.

Una aventura nueva no debe requerir código específico en el engine. El DSL crece sólo
cuando un caso real necesita una primitiva nueva: resolver primero el contenido actual,
mantener las responsabilidades separadas y no anticipar un lenguaje general de scripts.

## Repositorios, tecnología y Git

- Repositorio principal: `/home/esteban/Documents/games`; contiene `frontend/`, las
  pruebas y `scripts/`.
- Módulo backend reservado: `cabezudo.dev/api/backend/games`. Todavía no aporta
  comportamiento al editor y no debe ampliarse sin una necesidad concreta.
- Rama permanente: `games`. Cada tarea se implementa allí, se integra en `main` y se
  publican ambas referencias según el flujo general.
- Frontend Vite en JavaScript con ES modules, HTML y CSS; no usa framework ni
  TypeScript. Debe ser portable y no contener rutas absolutas, dominios o dependencias
  implícitas del frontend de `cabezudo.dev`.
- Los ZIP de revisión son untracked. `scripts/package-games-sources.sh` sólo incluye
  archivos conocidos por Git; nunca ejecuta `git add` ni incorpora untracked
  implícitamente. Todo archivo nuevo legítimo se agrega explícitamente al índice y se
  declara como `--files games/...` o `cabezudo.dev/...`; archivos tracked modificados
  no se pasan en esa lista.

## Arquitectura y estado

El flujo principal es:

```text
YAML → GameModel/SceneModel → estado y runtimes → coordinación → renderer
```

- Modelo declarativo, estado global del juego, runtime de la escena activa, movimiento,
  navegación, ejecución de acciones, selección visual, animación y renderer son
  responsabilidades separadas.
- El YAML y los modelos normalizados son inmutables durante la ejecución. Posiciones,
  rutas, facing, motion, animaciones, diálogo, selección y pendientes viven en runtime.
- `currentGameState` contiene flags e inventario globales. Sólo la escena activa crea
  actors runtime, movement loops, cámara, diálogo, interacción, llegada de walk y
  animaciones.
- El movement engine sólo conoce rutas, tiempo, posición y finalización; no conoce
  hotspots, actores objetivo, inventario, flags, diálogos ni patrol.
- El renderer refleja el modelo efectivo y los runtimes; no decide reglas de juego.

## Viewport, cámara, profundidad y límites

- `portrait` y `landscape` son casos de primera clase. Las escenas tienen dimensiones
  lógicas independientes del dispositivo y conservan proporción al renderizarse.
- Coordenadas world, desplazamiento `camera.x` y coordenadas screen son conceptos
  separados. La posición runtime nunca se convierte en posición de pantalla.
- La cámara sólo sigue al `controlled_actor`. Lo centra horizontalmente de inmediato,
  sin dead zone, y limita `camera.x` a los extremos de la escena. Los otros actores se
  mantienen en world coordinates.
- `position.x` es el centro horizontal de los pies y `position.y` es la vertical de los
  pies. Escala y profundidad se calculan con esa Y.
- Los actores se ordenan por Y ascendente; a igual Y conservan el orden YAML. Su orden
  respecto de elementos usa `depth_y`; elementos sin `depth_y` conservan su z normal.
- Los límites del actor usan su ancho y alto ya escalados: el dibujo completo queda
  dentro de la escena, salvo que los pies pueden alcanzar el límite inferior.

## Actores, representación y movimiento

- El formato vigente usa `actors` y un único `controlled_actor`. El formato antiguo
  `character` se normaliza como un único actor controlado; `character` y `actors` juntos
  son ambiguos.
- Cada actor tiene runtime independiente: `position`, `route`, `destination`, `facing`,
  `motion`, override visual, animación y, cuando corresponda, patrol.
- Facing soporta exactamente 1 (`default`), 2 (`left`, `right`), 4 y 8 direcciones. Se
  deriva del vector real del segmento; Y negativa es `up`, Y positiva `down`. En modo 2,
  movimiento principalmente vertical conserva el último horizontal o usa `right`.
- `motion` sólo puede ser `idle` o `walking`. Conserva el último facing al detenerse.
  `talking` es `visualStateOverride`, no un tercer motion.
- Visuales soportan sintaxis antigua `asset`/`assets` y `states` con `idle`, `walking` y
  `talking` opcional. Cada representación normalizada es asset estático o animación de
  frames con fps positivo y loop booleano; strings SVG se normalizan como assets.
- El runtime de animación es independiente por actor y avanza por tiempo real. Cambiar
  representación, motion, facing o revisión explícita reinicia en frame 0; una selección
  idéntica continúa. Animaciones idle avanzan aunque el actor esté quieto.
- Variantes visuales de actores se resuelven por una condición simple de flag. Cero
  coincidencias usa el visual base; más de una es error. El fallback de `talking` es el
  `idle` del mismo visual efectivo, nunca el visual base de otra variante.
- Una ruta reemplaza la anterior. Un frame puede consumir varios segmentos y facing se
  actualiza al comenzar cada tramo, no sólo al destino final.
- El único movimiento autónomo vigente es `patrol`, circular sobre al menos dos puntos.
  Usa el mismo movimiento y red walk que el jugador. `enabled_when` puede detenerlo de
  inmediato en su posición, conservando facing y `nextPointIndex`; al reactivarse
  recalcula desde la posición actual, sin teleport. Un error de ruta deja sólo ese actor
  idle y conserva el error.

## Red caminable y llegadas

- `walk` contiene nodos únicos y paths bidireccionales. Origen, destino, approaches y
  puntos de patrol se proyectan al segmento activo más cercano; no deben estar
  exactamente sobre la red.
- Dijkstra calcula la ruta mínima sobre el grafo activo. `walk.paths[].enabled_when`
  excluye un path tanto de proyección como de Dijkstra.
- Un cambio de flag afecta cálculos futuros. Una ruta ya almacenada puede terminar y no
  se invalida ni recalcula retroactivamente.
- La proyección identifica `arrivalNodeId` sólo si termina, con tolerancia numérica, en
  un extremo de segmento; en medio de un segmento es `null`.
- `walk.nodes[].on_arrival` usa acciones generales y `enabled_when` opcional evaluado al
  llegar. Sólo se ejecuta si ese nodo es el destino final de una navegación libre nueva
  del actor controlado, incluso con ruta vacía.
- `on_arrival` no se ejecuta en nodos intermedios, patrol, approach a hotspot, approach
  a actor ni approach a scene object. Una nueva intención reemplaza
  `pendingWalkArrival`; cualquier interacción lo cancela.

## Interacciones y approaches

- Flujo con approach: click → capturar intención/item → proyectar y calcular ruta →
  caminar → revalidar objetivo → completar llegada → panel/acciones. No se ejecutan
  efectos durante el recorrido.
- Hotspots sin `approach` conservan ejecución inmediata. `enabled_when` controla
  visibilidad e interacción; se revalida al llegar y un hotspot deshabilitado no ejecuta
  efectos ni uso de item.
- Existe una sola `pendingInteraction` global con `targetType`, `targetId` e `itemId`.
  Click libre cancela; otro actor/hotspot reemplaza. El item queda capturado al iniciar y
  debe seguir en inventario al llegar.
- Los actores con `interactions` se pulsan directamente; su approach se calcula desde
  la posición runtime del actor y `approach_distance`. Los efectos genéricos pueden
  tener variantes por flag resueltas al llegar. Una interacción específica `on_actor`
  con item tiene prioridad absoluta y nunca cae a efectos genéricos.
- El actor controlado no es objetivo de interacción. Actores no interactivos no
  consumen el click, que continúa como navegación libre.
- Scene objects enlazan identidad/nombre con un elemento y hotspot existentes; no crean
  un hotspot conceptual duplicado ni heredan sus efectos o interacción con item.
- `proximity` fue eliminado y se rechaza en el DSL. No deben dispararse acciones o
  diálogos por distancia. `collision` se reserva para contacto físico real y todavía no
  está implementado.

### Facing declarativo de approach

- `hotspots[].approach.facing` es opcional y se normaliza siempre como `facing: null`
  cuando falta.
- Si existe, debe ser una orientación soportada por el visual del actor controlado; una
  escena sin actor controlado o un valor incompatible es error en la ruta YAML exacta.
- Se aplica sólo después de terminar toda la ruta y revalidar disponibilidad, antes de
  mostrar el panel, ejecutar efectos, usar inventario o iniciar diálogo. También se
  aplica cuando la nueva intención produce una ruta vacía.
- No se aplica al iniciar, durante el recorrido, ante fallo/cancelación/reemplazo, ni si
  el hotspot u objeto deja de estar disponible.
- No participa en navegación libre, patrol ni actor interactions. No crea ruta, acción,
  motion o cambio de posición; deja al actor idle y el renderer refleja el nuevo facing.

## Acciones, flags e inventario

- `game-actions.js` normaliza y ejecuta secuencialmente: `set_flag`, `clear_flag`,
  `toggle_flag`, `give_item`, `take_item`, `start_dialogue` y `change_scene`.
- No hay rollback: si una acción posterior falla, las anteriores permanecen aplicadas.
- `change_scene` se permite únicamente en `hotspot.effects` y
  `walk.nodes[].on_arrival.effects`; debe aparecer una sola vez y como última acción.
  Está prohibido en actores, scene objects y demás contextos.
- Flags declaradas con booleanos son mutables. Flags calculadas admiten exactamente
  `previous_flag and previous_flag` o `previous_flag or previous_flag`, sólo con
  referencias previamente declaradas; pueden encadenarse y son de sólo lectura.
- Las flags calculadas son getters efectivos, se actualizan en la misma secuencia de
  acciones y todos los consumidores leen booleanos sin distinguir su origen.
  `copyFlagsState()` conserva definiciones, orden, getters y protección en una copia
  independiente para `GameModel.initialState`.
- `set_flag`, `clear_flag` y `toggle_flag` rechazan flags calculadas tanto en modelo como
  en runtime.
- `items` es el catálogo global de IDs conocidos. `state.inventory` es la lista ordenada
  de posesión inicial y sólo admite IDs catalogados sin duplicados. Interacciones pueden
  referir a un item catalogado aunque no sea poseído inicialmente.
- `give_item` agrega al final y es no-op si ya existe; `take_item` elimina y es no-op si
  falta. Al retirar el item seleccionado, la selección se limpia. Una interacción
  pendiente con un item retirado falla al llegar.

## Elementos e iluminación

- Elementos admiten `id`, posición y tamaño world, `z`, `depth_y`, exactamente uno de
  `color` o asset SVG, `visible_when` y variantes.
- Una variante usa una condición `flag/value` y puede reemplazar posición, tamaño,
  color/asset o z. Cero coincidencias conserva la base; más de una es error.
- `visible_when`, variantes, hotspots, paths, patrols y acciones condicionales comparten
  `createFlagCondition()`/`matchesFlagCondition()` y leen flags efectivas.
- La iluminación es contenido declarativo: fondo del patio, mesa e interruptor cambian
  mediante variantes de assets. No existe `dark_overlay`, filtro, opacity global,
  shader ni lógica especial de iluminación en renderer.

## Diálogos

- Los diálogos son locales a la escena, lineales, con ID único y líneas no vacías de un
  actor existente. Runtime guarda sólo `dialogueId` y `lineIndex`.
- `start_dialogue` inicia la sesión mediante el mismo ejecutor de acciones. Un diálogo
  activo bloquea navegación e interacciones nuevas, pero no pausa actores no
  participantes.
- Los participantes son los actores únicos presentes en las líneas. Al comenzar se
  detienen, se limpian route/destination y quedan idle sin cambiar posición. Con dos se
  orientan entre sí; con uno o más de dos conservan facing.
- El actor controlado no recupera su ruta. Patrols participantes conservan
  `nextPointIndex` y al cerrar se reconcilian desde su posición actual sólo si siguen
  habilitados; los demás actores continúan normalmente.
- Sólo el actor de la línea actual recibe `visualStateOverride: talking`; los demás
  usan idle. Cada línea incrementa la revisión visual para reiniciar talking en frame 0,
  incluso si dos líneas consecutivas pertenecen al mismo actor.
- Duración: `clamp(300 + trim(text).length * 45, 600, 5000)` milisegundos. Al expirar se
  limpia únicamente el override; speaker, línea y texto continúan hasta pulsar
  `Continuar`. No hay avance automático.
- Cada nueva línea cancela el timer anterior y usa una generación para ignorar callbacks
  obsoletos. Cerrar diálogo, cambiar/desactivar escena o recargar cancela el timer.

## Escenas y cambio de escena

- Formato actual: `game.initial_scene`, `items` y `state` globales, más `scenes[]` con
  IDs únicos. Visuales, actores, diálogos, walk, elementos, hotspots, interacciones y
  objetos pertenecen a cada escena.
- El formato antiguo `scene` de una sola escena se normaliza al mismo GameModel;
  `scene` y `scenes` juntos son inválidos. Referencias a actores, diálogos, hotspots y
  objetos no cruzan escenas.
- `activateScene()` usa un SceneModel ya construido, conserva el mismo gameState y
  catálogo global, limpia selección de inventario y crea runtimes/cámara desde cero.
- Al salir se detienen loops y rutas, se limpian pendientes, contexto de objetos,
  diálogo/timer/sesión, actores, animaciones, cámara y DOM. No quedan RAF o patrols de
  la escena anterior.
- Flags e inventario sobreviven. Las posiciones `x/y` de todos los actores se guardan
  por escena al salir y se restauran antes de preparar patrols al volver durante la
  misma partida cargada. Route, destination, facing, motion, animación, override visual,
  patrol y demás runtimes se recrean; recargar el YAML o la página borra los snapshots
  y vuelve a las posiciones declaradas.

## Scene objects y Objetos cercanos

- `objects[]` normaliza `id`, `name`, referencias únicas a `element` y `hotspot`,
  `location` opcional (por defecto el ID) y `actions` opcionales. Elemento, hotspot,
  identidad de escena e item poseíble son conceptos separados.
- Runtime mínimo: `pendingObjectId`, `activeLocationId`, `selectedObjectId`; nunca copia
  objetos del modelo. El panel aparece sólo tras completar approach y selecciona el
  objeto alcanzado.
- `sceneObjectIsAvailable(sceneObject, sceneModel, gameState)` es la única regla de
  disponibilidad: exige simultáneamente elemento visible y hotspot habilitado. Se usa
  para hover/foco, click, approach, llegada, panel y ejecución.
- Un objeto no disponible no recibe hover, foco, click ni approach. Si desaparece en el
  recorrido, la llegada limpia todo el contexto y no activa la location.
- Objetos cercanos se derivan en cada render por location y disponibilidad; no usan
  distancia. Si el seleccionado desaparece se limpia la selección; la location se
  conserva mientras quede otro objeto disponible.
- Navegación libre, otro objeto, actor, hotspot normal, recarga o cambio de escena
  limpian el contexto. Hover, foco, selección de inventario y rerender normal no.
- Acciones de objeto tienen `id`, `label`, lista no vacía de acciones generales y
  `enabled_when` opcional. Sólo se renderizan para el objeto seleccionado; una condición
  falsa las oculta, no sólo las deshabilita. Diálogo activo deshabilita los botones
  visibles.
- Antes de ejecutar se vuelven a resolver objeto, disponibilidad, pertenencia y
  condición; referencias obsoletas no producen efectos. Después se reconcilian location
  y selección. Las acciones no ejecutan efectos heredados del hotspot y no permiten
  `change_scene`.

## Ejemplo vigente

- Juego global con escenas `yard` (portrait) y `house` (landscape), catálogo
  `dog_food`, `brass_key`, `coin` y estado compartido.
- Iluminación: `electricity_on` y `light_switch_on` calculan `light_on`; fondo y mesa
  cambian por `light_on`, mientras el dibujo del interruptor depende de
  `light_switch_on`. No hay overlay oscuro.
- Perro: patrol condicionado por `dog_fed`, interacción con `dog_food`, visual normal o
  alimentado y diálogos warning/friendly. Waiter inicia diálogo sólo por click explícito.
- Llave de latón: scene object con `Mirar` y `Tomar`; tomar agrega el item y la oculta
  mediante `brass_key_taken`.
- Cajón: `Abrir`/`Cerrar` cambian `drawer_open` mediante acciones condicionadas; moneda
  y hotspot aparecen con `drawer_contents_visible = drawer_open and coin_in_drawer` en
  la misma location. Al reabrir, la moneda reaparece sólo si continúa dentro; una
  moneda ya tomada no se recrea.
  Moneda permite `Mirar` y `Tomar`; tomar agrega `coin` y limpia `coin_in_drawer`.
  Después, seleccionar Cajón ofrece `Mirar` y muestra “El cajón está vacío.”
- Mesa: scene object separado en location `table_surface`; tras approach ofrece sólo
  `Mirar` y el diálogo “Es una mesa sólida.” El cajón y la moneda conservan prioridad
  en el área superpuesta.
- Facing de approaches en `yard`: interruptor, palanca y puerta `up`; llave, mesa,
  cajón y moneda `left`. La salida de `house` omite facing y conserva la derivada.

## Estado confirmado y operación

Capacidades consolidadas entre TAREAS 48–58: acciones declarativas de objetos,
empaquetado explícito de fuentes nuevas, condiciones de acciones, composición del
cajón/moneda/estado vacío, ciclo declarativo de abrir/cerrar, flujo Git permanente,
comentario explícito de mesa mediante diálogo, facing final declarativo de approaches
y memoria de posiciones de actores por escena durante la partida cargada.

- Última suite: 431 pruebas aprobadas.
- Último build: Vite, 128 módulos transformados.
- Commit confirmado de TAREA 56:
  `d3c04a6bed596621a82b1245a664ff2b8bdde8fb`.
- ZIP confirmado: `scripts/games-sources-review-20260901-164238.zip`, 172 archivos,
  SHA-256 `56acd39b32b70b87db2c54865f387044818317aaf5d85055771d1dd8d13eb23e`.
- Comandos: `cd frontend && npm test`, `cd frontend && npm run build`,
  `scripts/test-package-games-sources.sh`, `git diff --check`.

## Pendientes reales

- `collision` todavía no existe; cuando se necesite debe representar contacto físico
  real, no renombrar ni reintroducir la antigua distancia social `proximity`.
- No existe persistencia entre partidas/sesiones ni serialización de runtimes de escena.

No hay una siguiente funcionalidad decidida en esta memoria.
