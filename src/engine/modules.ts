/**
 * El alfabeto del sistema.
 *
 * Cada módulo es una máscara de bits sobre una subgrilla de RES×RES, así que la
 * composición entera es un bitmap a RES× la resolución de la grilla y no hace
 * falta cargar ninguna imagen. De ahí salen los bordes duros a cualquier zoom.
 *
 * La subgrilla es de 5×5 y no de 3×3 —como en la versión original, calcada de
 * los cuatro PNG de `tiles/`— porque a 3×3 no hay píxeles para distinguir un
 * círculo de un triángulo: los dos degeneran en el mismo borrón. A 5×5 cada
 * silueta se lee, y 25 bits todavía entran enteros en un Uint32.
 *
 * Bit i = fila*RES + columna, empezando arriba a la izquierda.
 */

export const RES = 5
export const CELLS = RES * RES

/**
 * Las máscaras se declaran como dibujos y se compilan a bits al cargar. Escribir
 * el literal binario a mano obligaría a leerlo al revés —el bit más alto es la
 * esquina inferior derecha— y con siluetas asimétricas como el triángulo eso es
 * una fuente de errores garantizada.
 */
function mask(art: string): number {
  const cells = art.replace(/[^X.]/g, '')
  if (cells.length !== CELLS) {
    throw new Error(`Módulo de ${cells.length} celdas, se esperaban ${CELLS}`)
  }
  let bits = 0
  for (let i = 0; i < CELLS; i++) {
    if (cells[i] === 'X') bits |= 1 << i
  }
  return bits >>> 0
}

const popcount = (bits: number) => {
  let n = 0
  for (let i = 0; i < CELLS; i++) if ((bits >> i) & 1) n++
  return n
}

// --- Ids concretos ---------------------------------------------------------
// Son los que viajan en Grid.module y los que indexa el rasterizador. El checker
// tiene dos porque son complementos exactos: se alternan por paridad de celda,
// no se eligen por densidad. Para todo lo demás son uno a uno con las siluetas.

export const EMPTY = 0
export const CHECKER_B = 1
export const CHECKER_A = 2
export const RING = 3
export const TRIANGLE = 4
export const CIRCLE = 5
export const SOLID = 6

export const MODULE_BITS = new Uint32Array([
  0,
  mask(`
    .X.X.
    X.X.X
    .X.X.
    X.X.X
    .X.X.
  `),
  mask(`
    X.X.X
    .X.X.
    X.X.X
    .X.X.
    X.X.X
  `),
  mask(`
    .XXX.
    XX.XX
    X...X
    XX.XX
    .XXX.
  `),
  mask(`
    ..X..
    .XXX.
    .XXX.
    XXXXX
    XXXXX
  `),
  mask(`
    .XXX.
    XXXXX
    XXXXX
    XXXXX
    .XXX.
  `),
  mask(`
    XXXXX
    XXXXX
    XXXXX
    XXXXX
    XXXXX
  `),
])

// --- Siluetas seleccionables ----------------------------------------------

export type ModuleKey = 'checker' | 'ring' | 'triangle' | 'circle' | 'solid'

/** Ordenadas por cobertura de tinta ascendente: es el eje expresivo del motor. */
export const MODULE_ORDER: readonly ModuleKey[] = [
  'checker',
  'ring',
  'triangle',
  'circle',
  'solid',
]

export const MODULE_LABELS: Record<ModuleKey, string> = {
  checker: 'Checker',
  ring: 'Anillo',
  triangle: 'Triángulo',
  circle: 'Círculo',
  solid: 'Sólido',
}

/** Id concreto de cada silueta. El checker resuelve su fase al elegir. */
const MODULE_ID: Record<ModuleKey, number> = {
  checker: CHECKER_A,
  ring: RING,
  triangle: TRIANGLE,
  circle: CIRCLE,
  solid: SOLID,
}

/**
 * Cobertura de tinta de cada silueta. La del checker es el promedio de sus dos
 * fases (13/25 y 12/25): como se alternan celda a celda, lo que la densidad ve
 * de una zona de checkers es ese promedio, no una de las dos.
 */
export const MODULE_INK: Record<ModuleKey, number> = {
  checker: (popcount(MODULE_BITS[CHECKER_A]) + popcount(MODULE_BITS[CHECKER_B])) / (2 * CELLS),
  ring: popcount(MODULE_BITS[RING]) / CELLS,
  triangle: popcount(MODULE_BITS[TRIANGLE]) / CELLS,
  circle: popcount(MODULE_BITS[CIRCLE]) / CELLS,
  solid: popcount(MODULE_BITS[SOLID]) / CELLS,
}

/** Preview de una silueta para la UI: las RES*RES celdas como booleanos. */
export function moduleCells(key: ModuleKey): boolean[] {
  const bits = MODULE_BITS[MODULE_ID[key]]
  return Array.from({ length: CELLS }, (_, i) => ((bits >> i) & 1) === 1)
}

// --- Rampa -----------------------------------------------------------------

/**
 * La rampa de densidad de un conjunto de siluetas: el vacío más lo que esté
 * activado, ordenado por tinta. `pickModule` la recorre para traducir una
 * densidad continua en un módulo concreto.
 *
 * Se compila una vez por composición y no por celda: son sólo seis entradas,
 * pero la celda es el bucle caliente y ahí no queremos ni un filter.
 */
export interface Ramp {
  ink: Float32Array
  keys: (ModuleKey | null)[]
}

/** Con nada activado no habría con qué dibujar, así que el sólido es el piso. */
const FALLBACK: readonly ModuleKey[] = ['solid']

export function buildRamp(enabled: readonly ModuleKey[]): Ramp {
  // Un preset importado a mano puede traer cualquier cosa acá.
  const list = Array.isArray(enabled) ? enabled : []
  const on = MODULE_ORDER.filter((k) => list.includes(k))
  const keys: (ModuleKey | null)[] = [null, ...(on.length ? on : FALLBACK)]
  const ink = new Float32Array(keys.length)
  for (let i = 1; i < keys.length; i++) ink[i] = MODULE_INK[keys[i] as ModuleKey]
  return { ink, keys }
}

/**
 * Traduce una silueta al id concreto que se rasteriza.
 *
 * El checker es el único caso con dos fases. Son complementos exactos, así que
 * elegir entre ellas por densidad las desperdiciaría: las decide la paridad de
 * la celda cuando la coherencia es alta —encajan formando una malla diagonal
 * continua— y el ruido cuando es baja.
 */
function resolve(key: ModuleKey, parity: number, jitter: number, coherence: number): number {
  if (key !== 'checker') return MODULE_ID[key]
  const wantB = coherence > 0.5 ? parity === 1 : jitter > 0.5
  return wantB ? CHECKER_B : CHECKER_A
}

/**
 * Elige el módulo para una densidad objetivo.
 *
 * Entre dos escalones de la rampa se reparte de forma estocástica en vez de
 * cortar duro: así una zona intermedia sale como una mezcla de las dos siluetas
 * vecinas, que es lo que da la disolución de las referencias. `hard` sube el
 * escalonado hasta el corte limpio.
 */
export function pickModule(
  ramp: Ramp,
  density: number,
  jitter: number,
  hard: number,
  parity: number,
  coherence: number,
): number {
  const n = ramp.ink.length
  if (density <= 0 || n < 2) return EMPTY

  // Por encima del módulo más cubriente ya no hay a dónde subir. Con el sólido
  // apagado ese techo es la silueta más densa que quede activada.
  const top = n - 1
  if (density >= ramp.ink[top]) return resolve(ramp.keys[top]!, parity, jitter, coherence)

  let hi = 1
  while (hi < top && ramp.ink[hi] < density) hi++
  const lo = hi - 1

  const span = ramp.ink[hi] - ramp.ink[lo]
  let t = span > 1e-6 ? (density - ramp.ink[lo]) / span : 0

  // hard=1 colapsa el reparto al escalón más cercano; hard=0 lo deja lineal.
  if (hard > 0) {
    const stepped = t < 0.5 ? 0 : 1
    t += (stepped - t) * hard
  }

  const idx = jitter < t ? hi : lo
  const key = ramp.keys[idx]
  return key === null ? EMPTY : resolve(key, parity, jitter, coherence)
}
