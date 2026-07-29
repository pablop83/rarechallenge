# Pixelator

Motor de composiciones generativas sobre un alfabeto de cuatro módulos. Cada celda de la grilla
contiene exactamente un módulo; toda la riqueza sale de dónde se coloca cada uno, de qué tamaño y de
qué color — nunca de introducir formas nuevas.

```bash
npm install
npm run dev
```

## Los cuatro módulos

Los PNG originales están en `tiles/`. Decodificados pixel a pixel resultaron ser, los cuatro, una
subgrilla de 3×3 celdas de 22px en negro puro o transparente puro: sin grises, sin antialias, nada
fuera de grilla.

```
 sólido        anillo      checker A     checker B
   ###           ###          #.#           .#.
   ###           #.#          .#.           #.#
   ###           ###          #.#           .#.
   9/9           8/9          5/9           4/9
```

Eso permite tratarlos como máscaras de 9 bits en vez de como imágenes, y de ahí salen tres
propiedades que con texturas habrían costado trabajo: la composición entera es un bitmap a 3× la
resolución de la grilla, se amplía por vecino más cercano en múltiplos enteros —cero antialias, borde
duro a cualquier zoom— y exportar a cualquier tamaño es exacto, no un reescalado.

## Dos cosas que el brief daba por sentadas y no eran

**La rotación y el espejado no hacen nada.** Los cuatro módulos son simétricos bajo las ocho
operaciones del grupo diedral: el anillo girado 90° es el anillo, el checker A espejado es el checker
A. El eje existe en el modelo de datos pero no tiene efecto visual, así que no está expuesto en la UI.
Si algún día entra un módulo asimétrico, funciona solo.

**El eje expresivo real es la densidad de tinta.** Ordenados por cobertura, los módulos forman una
rampa limpia — 1.00 → 0.89 → 0.56 → 0.44 → vacío — y esa rampa es el lenguaje de las referencias:
masas sólidas que se disuelven en textura de anillos, después en trama de checkers, después en papel.
Los dos checkers son complementos exactos, así que encajan formando una malla continua.

## Cómo funciona

El orden importa. Primero un campo continuo decide la densidad de cada celda; después se colocan los
módulos grandes donde el campo está plano; recién al final se elige el módulo concreto de cada hueco.
Hacerlo así —campo antes que módulo— es lo que hace que la composición se lea como diseñada: las
celdas vecinas comparten el valor del campo, así que se agrupan solas sin reglas de vecindad
explícitas.

**Campo** — ruido fbm, ruido con crestas, campo de distancia a atractores, campo de flujo por curl, o
Voronoi. La simetría se aplica plegando la coordenada antes de muestrear, y la distorsión deformando
esa misma coordenada, así que doblan la composición entera —densidad y color a la vez— en lugar de
mover píxeles ya resueltos. La grilla nunca se rompe: lo que se deforma es de dónde lee cada celda.

**Escala** — de mayor a menor, un módulo grande sólo entra donde el campo está plano. Los anillos
grandes caen en los llanos y la textura fina queda para las zonas movidas, que es la jerarquía de los
pósters de referencia.

La escala mínima fija la unidad de la trama, para cuando la celda suelta queda demasiado chica. Todo
se coloca sobre una retícula de ese paso y las escalas mayores son múltiplos suyos: si no lo fueran,
un módulo de 3 sobre una retícula de 2 dejaría un resto de una celda contra el siguiente, y esos
intersticios son justamente los puntitos que el mínimo viene a eliminar. Por eso con unidad 2 las
escalas posibles son 2 y 4, y con unidad 3 sólo 3. Las dimensiones se recortan al múltiplo de la
unidad —como mucho tres celdas— para que la teselación cierre exacta contra el borde.

**Módulo** — la densidad se reparte entre los dos escalones de la rampa que la contienen. `Trama →
ruido` interpola entre una matriz de Bayer 4×4 —el punteado regular de la impresión— y un hash puro,
que granula. Entre los dos checkers no decide la densidad sino la paridad de la celda, porque son casi
iguales en cobertura pero complementarios en forma.

**Color** — va por un ruido propio, separado del de densidad. Si comparten fuente, cada detalle fino
de la estructura cruza un borde de la paleta y el color termina salpicado célula a célula.
`Agrupamiento` mezcla ese ruido con regiones de Voronoi: alto queda plano por manchas, como una
impresión a tintas; bajo degrada.

Ninguna paleta incluye un color parecido a su propio papel. La tinta blanca sobre papel blanco no es
un color claro, es una celda perdida — en las referencias las formas blancas no están impresas, son el
papel que asoma donde no hay módulo, y de eso ya se encarga el extremo vacío de la rampa.

## Formato

La proporción del lienzo se elige aparte de la resolución: el slider controla el lado mayor y el
selector la forma —cuadrado, 4:3, 16:9, A4 en las dos orientaciones—. En `Auto` la toma de la imagen
cargada, o queda cuadrado si no hay.

Cuando forzás una proporción distinta a la de la foto aparece el encaje: `Llenar` la escala hasta
cubrir y recorta lo que sobra, `Encajar` la mete entera y deja papel alrededor. Siempre escala por un
solo factor, nunca estira — dibujarla directamente a la grilla la deformaría.

## Presets

Se guardan en el navegador y se pueden bajar e importar como `.json`. Vienen cinco de fábrica como
punto de partida.

Por defecto un preset guarda el estilo pero no la semilla, la resolución ni la proporción, así que
aplicarlo cambia el look sin tocar la pieza en la que estás y podés seguir tirando semillas con el
mismo estilo puesto. El formato va con la pieza y no con el estilo por la misma razón que la
resolución: si viajara en el preset, aplicar un look te reencuadraría el lienzo. Al guardar hay un
checkbox para incluirlos si lo que querés es marcar una composición concreta.

Ningún preset guarda la imagen: son parámetros, no archivos.

## Convertir una imagen

Arrastrala al lienzo, pegala con ⌘V o cargala desde el panel. Todo pasa en el navegador: la imagen
nunca sale de la máquina.

La foto entra como una fuente más del campo, no como un camino aparte, así que una imagen convertida
sigue admitiendo distorsión, máscara y simetría. `Influencia` decide cuánto manda sobre el campo
procedural: en 1 la composición es la foto, en 0 vuelve a ser generativa, y el medio las cruza.

Al cargarla se calculan tres señales de una vez y los sliders sólo cambian cuánto pesa cada una:

- **Tono** — oscuro es mucha tinta, claro es papel.
- **Bordes** — Sobel sobre el mapa ya reducido. Es lo primero que se pierde al bajar una foto a cinco
  niveles de cobertura: sin bordes el contorno se disuelve en la trama.
- **Color** — el promedio real de cada celda. `Real → paleta` lo lleva hasta el color más cercano de
  la paleta activa; el medio es lo interesante, la foto reconocible pero impresa a las tintas del
  sistema.

La grilla adopta la proporción de la imagen y el slider pasa a controlar el lado mayor, así que no se
recorta ni se deforma nada.

Un PNG recortado guarda RGB (0,0,0) donde es transparente, así que la luminancia se lee sobre blanco
—el tono que uno ve al abrir el archivo— y el alfa se aplica aparte, para que lo recortado siga sin
pintar aunque se invierta o se suba el brillo.

## Rendimiento

Todo corre en el hilo principal con Canvas2D. Una grilla de 320×320 —102.400 celdas, 921.600 píxeles—
compone en ~80ms y rasteriza en ~5ms. Los sliders van por `useDeferredValue`, así que el arrastre es
fluido y la composición alcanza cuando el hilo se libera.

## Export

PNG hasta 9600×9600. El bitmap se genera directamente al tamaño pedido en vez de reescalar el
preview, así que no hay interpolación en ningún punto: la composición del preview y la del archivo son
la misma, sólo cambia cuántos píxeles mide cada subcelda. Opcionalmente con fondo transparente.

## Estructura

```
src/
  engine/   modules (las 4 máscaras y la rampa) · fields · noise · symmetry
            distort · mask · palette · source (imagen) · compose (el cerebro)
            raster · exporter
  state/    parámetros y valores por defecto · presets
  ui/       viewport y panel de controles
tiles/      los PNG originales, como referencia
```

## Todavía no

SVG y PDF. Los datos ya son rectángulos exactos, así que emitirlos es recorrer la grilla — pero una
composición densa de 300×300 son cientos de miles de rects y conviene fusionar corridas horizontales
antes de escribir el archivo.

Autómatas celulares y reacción-difusión como generadores, y máscaras desde imagen, SVG o texto. Todos
entran por la misma interfaz que los cinco campos actuales: devolver un escalar en [0,1] para una
coordenada.
