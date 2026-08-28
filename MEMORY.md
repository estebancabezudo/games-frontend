# Games — Memoria del proyecto

## Regla absoluta de endpoints

Los guiones (`-`) están totalmente prohibidos en todos los segmentos de endpoints. Los
conceptos compuestos se modelan con recursos anidados en inglés, por ejemplo
`/api/clients`, nunca `/api-clients`. No crear rutas ni aliases con guiones; una ruta
existente que los use es deuda que debe corregirse, no un precedente que copiar.

## 1. Objetivo

Construir una plataforma para crear y ejecutar aventuras gráficas 2D, principalmente para dispositivos móviles.

El objetivo no es desarrollar una única aventura, sino crear progresivamente:

- un motor reutilizable de aventuras;
- un editor web para crear y probar aventuras;
- un lenguaje declarativo basado en YAML;
- una biblioteca reutilizable de personajes, escenarios, animaciones, puzzles y comportamiento;
- contenido que permita producir nuevas aventuras con poca o ninguna modificación al motor.

El desarrollo debe ser incremental.

No se diseñará el motor completo ni el DSL completo por adelantado.

Las abstracciones deben aparecer como consecuencia de necesidades reales encontradas al construir aventuras.

---

# 2. Principio fundamental

El motor ejecuta reglas y el juego proporciona contenido.

Una aventura debería estar compuesta principalmente por:

- YAML;
- SVG;
- imágenes;
- animaciones;
- audio;
- diálogos;
- configuración.

Idealmente, crear una aventura nueva no debe requerir modificar código del motor.

Otro principio fundamental:

> Ninguna característica debe agregarse al DSL hasta que una aventura real la necesite.

El editor será también la herramienta utilizada para descubrir y evolucionar ese DSL.

---

# 3. Tipo de juego

El concepto inicial es una aventura gráfica 2D tipo point-and-click, inspirada conceptualmente en aventuras clásicas como Day of the Tentacle, pero considerablemente más simple y diseñada para teléfonos.

El jugador:

- recorre escenarios;
- mueve físicamente un personaje;
- examina elementos;
- recoge objetos;
- mantiene un inventario;
- habla con personajes;
- usa objetos sobre elementos del escenario;
- resuelve problemas mediante cadenas lógicas;
- modifica el estado del mundo;
- avanza una historia.

Los puzzles deben favorecer soluciones que puedan deducirse.

Evitar soluciones arbitrarias cuya única lógica sea conocer lo que pensó el diseñador.

---

# 4. Modelo de producción

El motor debe permitir reutilizar:

- protagonistas;
- personajes secundarios;
- escenarios;
- objetos;
- animaciones;
- lógica;
- puzzles;
- comportamiento;
- interfaces;
- sistemas de inventario;
- diálogos;
- assets.

La intención futura es poder producir aproximadamente una aventura o episodio nuevo por mes cuando las herramientas estén maduras.

Las aventuras pueden compartir un mismo universo y personajes recurrentes.

Esto permite que la reutilización de assets sea también una característica narrativa.

---

# 5. Aplicación o catálogo

No está decidido todavía si cada aventura será una aplicación independiente o si existirá una aplicación que funcione como biblioteca de aventuras.

Una posibilidad futura:

- primera historia gratuita;
- historias adicionales pagadas;
- publicidad;
- pistas mediante rewarded ads;
- episodios individuales;
- eventualmente suscripción.

No implementar todavía decisiones comerciales dentro del motor salvo que sean necesarias.

---

# 6. Product placement y patrocinio

El motor debe permitir integrar productos patrocinados dentro de la ficción.

Ejemplos:

- una lata de una marca determinada utilizada para cocinar;
- alimento comprado en Petco utilizado para distraer o alimentar un perro;
- productos visibles dentro de cocinas, tiendas, oficinas u otros escenarios.

La publicidad debe integrarse naturalmente en la historia y no sentirse como un banner colocado encima del juego.

El puzzle no debe depender directamente de una marca.

Ejemplo conceptual:

```yaml
object:
  id: dog_food
  role: dog_food
  asset: sponsors/petco/dog_food.svg
```

La lógica depende de:

```text
role = dog_food
```

y no de:

```text
brand = Petco
```

Esto debe permitir sustituir:

```text
objeto genérico
→ patrocinador A
→ patrocinador B
→ objeto genérico
```

sin modificar la lógica del puzzle.

En el futuro se podrá medir:

- objeto mostrado;
- objeto recogido;
- objeto utilizado;
- puzzle resuelto mediante ese objeto.

---

# 7. Sistema gráfico

Los escenarios son mundos 2D.

Los recursos gráficos serán principalmente SVG cuando resulte adecuado.

Una escena puede contener:

- fondo;
- elementos gráficos;
- personajes;
- objetos;
- decoración;
- elementos interactivos;
- foreground;
- animaciones.

Los elementos deben ser independientes cuando necesiten movimiento, interacción o profundidad propia.

---

# 8. Coordenadas del mundo

Cada escena tiene su propio sistema de coordenadas lógico.

Estas coordenadas son independientes de:

- resolución física;
- tamaño del teléfono;
- densidad de píxeles;
- relación de aspecto del dispositivo.

Ejemplo conceptual:

```yaml
scene:
  size:
    width: 3200
    height: 1920
```

Estos valores representan espacio lógico, no píxeles físicos necesariamente.

---

# 9. Portrait y landscape

El motor NO debe asumir orientación horizontal.

Deben ser casos de primera clase:

- portrait;
- landscape.

Existe una posibilidad importante de que muchos juegos se diseñen principalmente en vertical.

Una escena o un juego debe poder declarar su orientación y comportamiento del viewport.

La arquitectura no debe impedir que eventualmente existan escenas con comportamientos distintos.

---

# 10. Viewport

El viewport es la cámara mediante la cual el dispositivo observa una parte del mundo.

El alto visible debe ser configurable.

Debe existir un modo en el cual la altura de la escena visible corresponda siempre a toda la altura disponible del dispositivo.

Ejemplo conceptual:

```yaml
viewport:
  height_mode: fit_device
```

La escena debe mantener sus proporciones.

No deformar el escenario arbitrariamente para ocupar ratios diferentes.

Un teléfono más ancho puede mostrar más contenido horizontal.

Uno más estrecho puede mostrar menos.

---

# 11. Escenarios mayores que el viewport

Los escenarios pueden ser deliberadamente mayores que la pantalla.

Esto permite:

- calles largas;
- habitaciones amplias;
- pasillos;
- plazas;
- escenarios que ocupen varias pantallas virtuales.

El escenario no tiene que tener la misma relación de aspecto que el teléfono.

---

# 12. Cámara horizontal

Comportamiento principal deseado:

El personaje intenta permanecer en el centro horizontal del viewport.

Mientras exista escenario disponible en la dirección del movimiento:

- el personaje permanece visualmente centrado;
- el escenario se desplaza detrás de él.

Conceptualmente:

```text
personaje camina →
escenario se mueve ←
```

Cuando la cámara alcanza el límite del escenario:

- el escenario deja de desplazarse;
- el personaje comienza a moverse desde el centro hacia el borde.

Al regresar:

- el personaje se desplaza primero hacia el centro;
- una vez centrado, vuelve a desplazarse el escenario.

La posición real del personaje siempre pertenece al mundo.

Debe mantenerse separada de su posición en pantalla.

Conceptos diferentes:

```text
worldX / worldY
screenX / screenY
cameraX / cameraY
```

No mezclarlos.

---

# 13. Profundidad

El escenario 2D debe simular profundidad.

La coordenada vertical del personaje puede representar profundidad:

```text
arriba de la pantalla
→ más lejos

abajo de la pantalla
→ más cerca
```

El personaje puede cambiar sutilmente de escala según su posición vertical.

La cantidad de escalado debe ser configurable por escenario.

Algunos escenarios pueden necesitar un efecto casi imperceptible.

Otros pueden utilizar una perspectiva más marcada.

El efecto debe ser sutil y coherente con el dibujo.

---

# 14. Orden de dibujo

La profundidad debe ayudar también a determinar si un personaje aparece:

- delante de un objeto;
- detrás de un objeto.

Evitar depender de una gran cantidad de capas manuales cuando la posición vertical pueda resolverlo.

Deben poder existir excepciones mediante:

- regiones de profundidad;
- líneas;
- reglas particulares de un elemento.

Esto permitirá que un personaje camine, por ejemplo:

- detrás de una mesa;
- luego delante de la misma;
- detrás de un árbol;
- delante de una columna.

---

# 15. Movimiento del personaje

Cuando el usuario toca una posición caminable:

- se determina el destino;
- se calcula una ruta válida;
- el personaje se desplaza hasta allí;
- la cámara lo sigue según las reglas configuradas.

Los escenarios podrán definir:

- zonas caminables;
- nodos;
- caminos;
- conexiones.

Inicialmente debe utilizarse la solución más simple que permita construir aventuras reales.

No implementar pathfinding sofisticado antes de necesitarlo.

---

# 16. Caminos

Una escena podrá definir un grafo de navegación mediante coordenadas.

Conceptualmente:

```text
node A
  |
node B ----- node C
               |
             node D
```

Esto permite controlar por dónde puede desplazarse un personaje sin necesitar navegación libre por toda la imagen.

El sistema debe evolucionar conforme aparezcan escenarios que necesiten comportamientos más complejos.

---

# 17. Elementos animados

Los objetos del escenario pueden tener movimiento propio.

Ejemplos:

- lámpara oscilando;
- cortina moviéndose;
- ventilador;
- humo;
- reloj;
- puerta;
- persona secundaria;
- objeto recorriendo una trayectoria.

Las animaciones deben ser principalmente declarativas.

Primitivas previstas:

- oscillate;
- translate;
- rotate;
- scale;
- opacity;
- frames;
- path.

Pueden admitir:

- duración;
- distancia;
- ángulo;
- dirección;
- repetición;
- easing.

Las animaciones deberían poder combinarse.

No implementar todas hasta que sean necesarias.

---

# 18. Hotspots

Los escenarios contienen zonas interactivas llamadas hotspots.

Un hotspot puede representar:

- objeto;
- puerta;
- persona;
- posición;
- máquina;
- zona del escenario.

Las regiones pueden ser inicialmente simples:

- rectángulo;
- círculo;
- polígono cuando sea necesario.

Los hotspots pueden aceptar acciones como:

- mirar;
- tomar;
- usar;
- hablar;
- abrir;
- cerrar;
- dejar;
- combinar.

No es necesario implementar todos los verbos inicialmente.

---

# 19. Punto de interacción

Un hotspot puede indicar dónde debe colocarse el personaje para interactuar con él.

Conceptualmente:

```yaml
approach:
  position:
    x: 720
    y: 850
  facing: up
```

Cuando el usuario interactúa con el hotspot:

```text
seleccionar hotspot
→ caminar al punto apropiado
→ orientarse
→ realizar acción
```

---

# 20. Inventario

El jugador puede poseer objetos.

El inventario forma parte del estado del juego.

Operaciones futuras:

- tomar objeto;
- entregar objeto;
- eliminar objeto;
- utilizar objeto;
- combinar objetos.

Mantener inicialmente el modelo tan simple como sea posible.

---

# 21. Estado

El juego se modelará principalmente mediante estado.

Inicialmente los conceptos más importantes serán:

- inventario;
- flags.

Ejemplo:

```yaml
state:
  inventory:
    - brass_key

  flags:
    door_open: false
    dog_fed: false
```

Una gran cantidad de puzzles puede expresarse simplemente mediante cambios de estado.

---

# 22. Modelo inicial de interacción

La generalización inicial debe ser extremadamente sencilla:

```text
estado actual
+
acción
+
condiciones
=
nuevo estado
```

Ejemplo:

```text
Tengo comida para perro.
La uso sobre el perro.
El perro queda alimentado.
dog_fed = true.
```

Y luego:

```text
house_door puede utilizarse
si dog_fed = true
```

Esto debe ser suficiente para comenzar.

---

# 23. Primer modelo del DSL

No diseñar un lenguaje completo anticipadamente.

Ejemplo conceptual inicial:

```yaml
interaction:
  use:
    item: dog_food
    on: dog

    effects:
      - set_flag:
          dog_fed: true
```

Otro:

```yaml
interaction:
  use:
    item: brass_key
    on: locked_door

    effects:
      - set_flag:
          door_unlocked: true
      - remove_item: brass_key
```

La sintaxis definitiva no está decidida.

Debe evolucionar mientras se construyen aventuras reales.

---

# 24. Acciones declarativas

Evitar código específico de una aventura como:

```text
handleKitchenDoor()
handleDogPuzzle()
```

Las acciones deben poder expresarse mediante operaciones del motor.

Ejemplo futuro:

```text
walk
face
animate
say
give
take
show
hide
set flag
clear flag
move
change scene
```

Conceptualmente:

```text
caminar
→ orientarse
→ animar
→ diálogo
→ modificar estado
→ entregar objeto
```

Sólo deben agregarse primitivas cuando sean necesarias.

---

# 25. Puzzles

No crear inicialmente una jerarquía sofisticada de tipos de puzzle.

Un puzzle puede comenzar simplemente como:

```text
objeto
+
hotspot
+
acción correcta
+
cambio de estado
```

Ejemplo:

```text
dog_food
+
dog
+
use
=
dog_fed
```

Cuando aparezcan aventuras que necesiten:

- varias soluciones;
- alternativas;
- secuencias;
- condiciones múltiples;
- consecuencias;
- estados parciales;

se estudiará cómo generalizarlas.

No antes.

---

# 26. Editor web

Debe existir una aplicación web para crear las aventuras.

El editor debe construirse temprano.

No esperar a tener el motor terminado.

Su función principal será permitir:

```text
escribir
→ ejecutar
→ jugar
→ descubrir limitación
→ mejorar DSL
→ continuar
```

El editor es parte del proceso de diseño del lenguaje.

---

# 27. Layout inicial del editor

Primera versión:

```text
+----------+----------------------+----------------------+
| MENU     | YAML / TEXT          | PREVIEW              |
|          |                      |                      |
|          |                      |                      |
|          |                      |                      |
+----------+----------------------+----------------------+
```

Debe contener:

- menú izquierdo;
- editor de texto;
- preview ejecutable.

Mantenerlo deliberadamente simple.

No implementar inicialmente:

- docking;
- múltiples paneles;
- diseñador visual;
- árbol complejo;
- inspector sofisticado;
- múltiples previews.

---

# 28. Evolución futura del editor

Más adelante podrá tener:

- pestañas por archivo;
- árbol de archivos;
- múltiples editores;
- inspector;
- herramientas visuales;
- edición gráfica de hotspots;
- edición de caminos;
- visualización de profundidad;
- editor de animaciones;
- debugger;
- visualización del estado;
- inventario;
- flags;
- teleport;
- reset de escena;
- reset de juego.

Agregar únicamente cuando resulte necesario.

---

# 29. Preview

El preview debe ejecutar el motor real.

No debe ser una representación falsa separada.

Flujo:

```text
YAML
→ parser
→ modelo
→ engine
→ renderer
→ preview
```

El mismo comportamiento debe poder utilizarse posteriormente en el juego final.

---

# 30. Estado durante desarrollo

El editor debe poder evolucionar hacia una vista que permita observar fácilmente:

```text
FLAGS
dog_fed            true
door_unlocked      false

INVENTORY
brass_key
flashlight
```

Y eventualmente modificar estado durante desarrollo:

- set flag;
- clear flag;
- give item;
- remove item;
- teleport;
- reset.

Esto permitirá probar puzzles sin repetir toda la aventura.

---

# 31. Backend

Dentro de `cabezudo.dev` se creará un módulo backend llamado:

```text
games
```

Debe seguir exactamente el estándar existente utilizado por módulos como:

- medicina;
- solar.

El módulo `games` contiene código backend específico del sistema de juegos.

Ejemplos futuros:

- solicitudes procedentes del editor;
- lectura de proyectos;
- guardar YAML;
- guardar archivos;
- subir imágenes;
- subir SVG;
- manejar assets;
- listar proyectos;
- listar escenas.

No implementar esas capacidades hasta que una tarea concreta las necesite.

---

# 32. Platform

Código verdaderamente reutilizable por otros módulos de `cabezudo.dev` debe permanecer en:

```text
platform
```

No colocar en `games` código genérico que pertenezca conceptualmente a la plataforma.

Igualmente, no mover prematuramente código a `platform` sólo porque potencialmente pudiera reutilizarse algún día.

Debe existir reutilización real o una responsabilidad claramente compartida.

---

# 33. Frontend

El editor estará inicialmente en:

```text
/home/esteban/Documents/games/frontend
```

Esta ruta identifica solamente su ubicación actual de desarrollo.

El código NO debe depender de esa ruta absoluta.

La aplicación será publicada inicialmente como:

```text
cabezudo.dev/game
```

El frontend debe ser independiente del frontend existente de `cabezudo.dev`.

No debe depender implícitamente de:

- CSS global;
- JavaScript global;
- librerías cargadas por otras páginas;
- componentes existentes;
- estado del frontend actual.

Si necesita una librería, debe incluirla explícitamente mediante su propia aplicación/build/configuración.

Debe poder trasladarse posteriormente a:

- otro dominio;
- otro servidor;
- otro hosting;

sin reescribir la aplicación.

---

# 34. Portabilidad

Evitar:

- rutas absolutas en código;
- dominios hardcoded;
- dependencias del hosting actual;
- dependencias implícitas del frontend de cabezudo.dev;
- APIs con URLs físicas incrustadas;
- configuración específica innecesaria.

La ubicación actual es provisional.

---

# 35. Seguridad

Inicialmente no habrá:

- login;
- autenticación;
- autorización;
- usuarios;
- roles;
- permisos.

No agregar seguridad por anticipación.

Se agregará cuando exista una necesidad real.

---

# 36. Persistencia

Inicialmente no habrá:

- base de datos;
- repositorios;
- persistencia compleja.

El backend podrá incorporar posteriormente almacenamiento de archivos cuando el editor lo necesite.

No crear infraestructura antes de que exista esa tarea.

---

# 37. Arquitectura conceptual futura del engine

El motor podrá evolucionar hacia componentes equivalentes a:

```text
ENGINE
 ├── Renderer
 ├── Depth / Scaling
 ├── Animation Engine
 ├── Pathfinding
 ├── Character Controller
 ├── Camera
 ├── Hotspot System
 ├── Inventory
 ├── Dialogue Engine
 ├── Game State
 └── Action Engine
```

Esto es una dirección conceptual.

NO implica crear desde el principio una clase, módulo o interfaz para cada elemento.

Las abstracciones deben aparecer cuando sean necesarias.

---

# 38. Contenido

Conceptualmente una aventura futura podrá contener:

```text
game/
 ├── scenes/
 ├── story/
 ├── graphics/
 ├── characters/
 ├── animations/
 ├── audio/
 └── configuration/
```

La organización concreta debe descubrirse durante la implementación.

No crear directorios vacíos solamente porque aparezcan en este documento.

---

# 39. Modelo de desarrollo

Trabajar siempre mediante tareas pequeñas.

Reglas:

1. Una tarea por vez.
2. Cada tarea debe tener un resultado verificable.
3. Al terminar, detenerse.
4. Revisar antes de continuar.
5. No implementar anticipadamente tareas posteriores.
6. No generalizar antes de tener un caso real.
7. No crear abstracciones vacías.
8. Mantener código simple.
9. Mantener componentes separables.
10. Ejecutar pruebas relevantes después de cada cambio.

---

# 40. Estado inicial de implementación

La secuencia inicial prevista es:

1. inspeccionar arquitectura existente;
2. crear módulo backend `games`;
3. crear `games/frontend`;
4. crear layout simple del editor;
5. agregar editor de texto;
6. parsear YAML;
7. crear primer modelo mínimo de escena;
8. renderizarlo en preview;
9. agregar primer elemento gráfico;
10. agregar estado básico;
11. agregar primer hotspot;
12. utilizar primer objeto de inventario sobre un hotspot.

Cada paso debe implementarse y revisarse por separado.

---

# 41. Filosofía del DSL

No queremos diseñar un nuevo lenguaje de programación dentro de YAML.

Evitar estructuras que conviertan YAML en código imperativo complicado.

El lenguaje debe hablar del dominio del juego:

```text
objeto
hotspot
inventario
acción
estado
flag
escena
personaje
diálogo
animación
```

Debe ser:

- declarativo;
- legible;
- validable;
- testeable;
- editable visualmente;
- comprensible sin conocer internamente el motor.

Su complejidad debe crecer únicamente junto con las aventuras reales.

---

# 42. Criterio principal

Cuando haya que decidir entre:

```text
hacer el motor más genérico
```

y:

```text
resolver limpiamente la aventura que estamos construyendo
```

primero resolver la aventura.

Después, si aparece el mismo concepto nuevamente, considerar generalizarlo.

El proyecto debe crecer desde casos reales, no desde abstracciones hipotéticas.
