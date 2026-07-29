/**
 * El alfabeto completo del sistema.
 *
 * Los cuatro PNG suministrados resultaron ser, pixel a pixel, una subgrilla de
 * 3x3 celdas de 22px en negro puro o transparente puro — sin grises, sin
 * antialias, nada fuera de grilla. Así que no hace falta cargar imágenes: cada
 * módulo es una máscara de 9 bits y toda la composición es un bitmap a 3x la
 * resolución de la grilla. De ahí salen los bordes duros a cualquier zoom.
 *
 * Bit i = fila*3 + columna, empezando arriba a la izquierda.
 */

export const EMPTY = 0
export const CHECKER_B = 1
export const CHECKER_A = 2
export const RING = 3
export const SOLID = 4

export const MODULE_COUNT = 5

/** Los módulos ordenados por cobertura de tinta ascendente. */
export const MODULE_BITS = new Uint16Array([
  0b000000000, // vacío        0/9
  0b010101010, // checker B    4/9  (los cuatro medios de lado)
  0b101010101, // checker A    5/9  (esquinas + centro)
  0b111101111, // anillo       8/9  (2.png)
  0b111111111, // sólido       9/9  (1.png)
])

/** Cobertura de tinta de cada módulo. Esta rampa es el eje expresivo del motor. */
export const MODULE_INK = new Float32Array([0, 4 / 9, 5 / 9, 8 / 9, 1])

export const MODULE_NAMES = ['vacío', 'checker B', 'checker A', 'anillo', 'sólido']

/**
 * Elige el módulo para una densidad objetivo.
 *
 * Entre dos escalones de la rampa se reparte de forma estocástica en vez de
 * cortar duro: así una zona de densidad 0.7 sale como una mezcla de anillos y
 * checkers, que es lo que da la disolución de las referencias. `hard` sube el
 * escalonado hasta el corte limpio.
 *
 * checkerA y checkerB están casi empatados en densidad (5/9 vs 4/9) pero son
 * complementos exactos, así que elegir entre ellos por densidad los
 * desperdiciaría. En su lugar los decide la paridad de la celda cuando la
 * coherencia es alta — encajan formando una malla diagonal continua — y el
 * ruido cuando es baja.
 */
export function pickModule(
  density: number,
  jitter: number,
  hard: number,
  parity: number,
  coherence: number,
): number {
  if (density <= 0) return EMPTY
  if (density >= 1) return SOLID

  // Localizar el tramo de la rampa que contiene la densidad pedida.
  let hi = 1
  while (hi < MODULE_COUNT - 1 && MODULE_INK[hi] < density) hi++
  const lo = hi - 1

  const span = MODULE_INK[hi] - MODULE_INK[lo]
  let t = span > 1e-6 ? (density - MODULE_INK[lo]) / span : 0

  // hard=1 colapsa el reparto al escalón más cercano; hard=0 lo deja lineal.
  if (hard > 0) {
    const stepped = t < 0.5 ? 0 : 1
    t += (stepped - t) * hard
  }

  let id = jitter < t ? hi : lo

  // Desempate de los dos checkers por paridad, no por densidad.
  if (id === CHECKER_A || id === CHECKER_B) {
    const wantB = coherence > 0.5 ? parity === 1 : jitter > 0.5
    id = wantB ? CHECKER_B : CHECKER_A
  }

  return id
}
