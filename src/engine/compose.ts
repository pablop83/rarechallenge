/**
 * El cerebro. Convierte parámetros en una grilla de módulos colocados.
 *
 * El orden importa: primero un campo continuo decide la densidad de cada celda,
 * después se colocan los módulos grandes donde el campo está plano, y recién al
 * final se elige el módulo concreto de cada hueco. Hacerlo así —campo antes que
 * módulo— es lo que hace que la composición se lea como diseñada: las celdas
 * vecinas comparten el valor del campo, así que se agrupan solas sin necesidad
 * de reglas de vecindad explícitas.
 *
 * Una imagen cargada entra como una fuente más de ese campo, no como un camino
 * aparte: se mezcla con el procedural antes de elegir módulo. Por eso una foto
 * convertida sigue admitiendo distorsión, máscara y simetría.
 */

import { Field } from './fields'
import { Noise } from './noise'
import { fold } from './symmetry'
import { warp } from './distort'
import { maskAt } from './mask'
import { pickModule, buildRamp, EMPTY } from './modules'
import { hash2, seedFromString, clamp, mix } from './rng'
import {
  inkColor,
  paletteColors,
  hexToPacked,
  lerpPacked,
  nearestInPalette,
  PALETTES,
  type ColorCtx,
} from './palette'
import { gridDims, type Source } from './source'
import { resolveAspect, type Params } from '../state/params'

/**
 * Matriz de Bayer 4x4. Con randomness baja el trama sale ordenado —el punteado
 * regular de la impresión— y con randomness alta se va hacia el hash puro, que
 * granula. Interpolar entre las dos da todo el rango entre trama y ruido.
 */
const BAYER = new Float32Array(
  [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16),
)

export interface Grid {
  w: number
  h: number
  /** 0 = celda consumida por un módulo mayor; >0 = ancla con esa escala. */
  scale: Uint8Array
  module: Uint8Array
  ink: Uint32Array
  paper: number
}

/**
 * Unidad mínima efectiva. Las escalas mayores son múltiplos suyos: si no lo
 * fueran, un módulo de 3 sobre una retícula de 2 dejaría un resto de 1 celda
 * contra el siguiente, y esos intersticios son justamente los puntitos que el
 * mínimo viene a eliminar.
 */
function unit(p: Params): number {
  return Math.max(1, Math.min(p.minScale, p.maxScale, 4))
}

/**
 * Dimensiones reales de la grilla. Se recortan al múltiplo de la unidad para
 * que la teselación cierre exacta y no quede una franja de celdas sueltas
 * contra el borde derecho e inferior. Se pierden como mucho tres celdas.
 */
export function gridFor(p: Params, src: { aspect: number } | null): [number, number] {
  const [w, h] = gridDims(p.grid, resolveAspect(p.aspect, src))
  const m = unit(p)
  return [Math.max(m, Math.floor(w / m) * m), Math.max(m, Math.floor(h / m) * m)]
}

export function compose(p: Params, src: Source | null = null): Grid {
  const [W, H] = gridFor(p, src)
  const N = W * H
  const seed = seedFromString(p.seed)

  const img = src ? src.sample(W, H, p.fit) : null
  const useImg = img !== null && p.imageAmount > 0
  const useImgColor = img !== null && p.imageColorAmount > 0

  const field = new Field({
    generator: p.generator,
    scale: p.fieldScale,
    octaves: p.octaves,
    attractors: p.attractors,
    seed,
  })
  const noise = new Noise(seed ^ 0x1b873593)
  // El color va por un ruido propio, no por el campo de densidad. Si comparten
  // fuente, cada detalle fino de la estructura cruza un borde de la paleta y el
  // color termina salpicado célula a célula; separándolos, las manchas de color
  // son grandes y la textura fina corre por debajo, como en las referencias.
  const colorNoise = new Noise(seed ^ 0x7f4a7c15)

  const density = new Float32Array(N)
  const colorT = new Float32Array(N)
  const region = new Float32Array(N)

  const usesRegion =
    p.colorClustering > 0.01 && p.colorMode !== 'mono' && p.colorMode !== 'duo'

  const folded = new Float64Array(2)
  const warped = new Float64Array(2)

  // El campo procedural se muestrea en coordenadas normalizadas al lado mayor,
  // así una grilla apaisada no estira el ruido.
  const long = Math.max(W, H)

  // --- Paso 1: densidad por celda -----------------------------------------
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      const nx = (x + 0.5) / W
      const ny = (y + 0.5) / H

      fold(p.symmetry, nx, ny, folded)
      warp(p.distortion, folded[0], folded[1], p.distortStrength, noise, warped)

      const f = field.sample((warped[0] * W) / long, (warped[1] * H) / long)

      // La máscara se evalúa en coordenadas sin deformar: la silueta es un
      // recorte de la lámina, no parte de la composición, así que no debería
      // torcerse con el vórtice ni con la onda.
      const m = maskAt(p.mask, nx, ny, p.maskSize, p.maskFeather, noise)

      let d = clamp((f - 0.5) * p.contrast + 0.5 + (p.density - 0.5) * 1.6, 0, 1)

      if (useImg) {
        // Oscuro = mucha tinta. Los bordes se suman como una señal aparte
        // porque son lo primero que se pierde al bajar una foto a cinco
        // niveles de cobertura: sin ellos el contorno se disuelve en la trama.
        const lum = p.imageInvert ? 1 - img.lum[i] : img.lum[i]
        const tone = 1 - lum
        const signal = mix(tone, img.edge[i], p.imageEdges)
        const adj = clamp(
          (signal - 0.5) * p.imageContrast + 0.5 + p.imageBrightness,
          0,
          1,
        )
        // El alfa va aparte del tono: así lo recortado sigue sin pintar aunque
        // se invierta o se suba el brillo.
        d = mix(d, adj * img.alpha[i], p.imageAmount)
      }

      density[i] = d * m

      switch (p.colorMode) {
        case 'gradientX':
          colorT[i] = nx
          break
        case 'gradientY':
          colorT[i] = ny
          break
        case 'radial':
          colorT[i] = clamp(Math.hypot(nx - 0.5, ny - 0.5) * 2, 0, 1)
          break
        default:
          colorT[i] = colorNoise.fbm01(nx * p.colorScale, ny * p.colorScale, 2)
      }

      if (usesRegion) region[i] = field.regionId(warped[0], warped[1], p.colorScale)
    }
  }

  // --- Paso 2: colocación de módulos grandes -------------------------------
  // De mayor a menor, para que los grandes ganen los sitios buenos. Un módulo
  // sólo entra donde el campo está plano, así los anillos grandes caen en los
  // llanos y la textura fina queda para las zonas movidas.
  //
  // Todo se coloca sobre una retícula del paso mínimo. Con unidad 1 no
  // restringe nada y el reparto es el de siempre; con unidad mayor es lo que
  // garantiza que el relleno final encaje sin dejar celdas sueltas.
  const scale = new Uint8Array(N)
  const occupied = new Uint8Array(N)
  const m = unit(p)
  const maxScale = Math.max(1, Math.min(p.maxScale, 4))
  const flatTol = (1 - p.scaleFlatness) * 0.5 + 0.02

  for (let s = Math.floor(maxScale / m) * m; s > m; s -= m) {
    for (let by = 0; by + s <= H; by += m) {
      for (let bx = 0; bx + s <= W; bx += m) {
        if (hash2(bx, by, seed + s * 7919) > p.scaleAmount) continue

        let free = true
        let lo = 1
        let hi = 0
        let sum = 0
        for (let dy = 0; dy < s && free; dy++) {
          for (let dx = 0; dx < s; dx++) {
            const j = (by + dy) * W + (bx + dx)
            if (occupied[j]) {
              free = false
              break
            }
            const d = density[j]
            if (d < lo) lo = d
            if (d > hi) hi = d
            sum += d
          }
        }
        if (!free) continue
        if (hi - lo > flatTol) continue
        if (sum / (s * s) <= 0.02) continue

        for (let dy = 0; dy < s; dy++) {
          for (let dx = 0; dx < s; dx++) occupied[(by + dy) * W + (bx + dx)] = 1
        }
        scale[by * W + bx] = s
      }
    }
  }

  // Lo que sobra se tesela con la unidad mínima. Como las dimensiones son
  // múltiplo suyo y todo lo anterior quedó alineado, esto cierra exacto.
  for (let by = 0; by < H; by += m) {
    for (let bx = 0; bx < W; bx += m) {
      const i = by * W + bx
      if (occupied[i]) continue
      for (let dy = 0; dy < m; dy++) {
        for (let dx = 0; dx < m; dx++) occupied[(by + dy) * W + (bx + dx)] = 1
      }
      scale[i] = m
    }
  }

  // --- Paso 3: módulo y color en cada ancla --------------------------------
  const pal = PALETTES[p.palette] ?? PALETTES.mono
  const colors = paletteColors(p.palette)
  const ctx: ColorCtx = {
    mode: p.colorMode,
    colors,
    ink: hexToPacked(p.ink),
    paper: hexToPacked(p.colorMode === 'mono' || p.colorMode === 'duo' ? p.paper : pal.paper),
    clustering: p.colorClustering,
  }

  const module = new Uint8Array(N)
  const ink = new Uint32Array(N)

  // La rampa depende sólo de qué siluetas estén activadas, así que se compila
  // una vez y no una por celda.
  const ramp = buildRamp(p.modules)

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      const s = scale[i]
      if (s === 0) continue

      // Un módulo grande promedia la densidad de todo lo que cubre.
      let d = density[i]
      let t = colorT[i]
      let r = region[i]
      if (s > 1) {
        let sum = 0
        let tsum = 0
        let rsum = 0
        for (let dy = 0; dy < s; dy++) {
          for (let dx = 0; dx < s; dx++) {
            const j = (y + dy) * W + (x + dx)
            sum += density[j]
            tsum += colorT[j]
            rsum += region[j]
          }
        }
        const n = s * s
        d = sum / n
        t = tsum / n
        r = rsum / n
      }

      const bayer = BAYER[(y & 3) * 4 + (x & 3)]
      const jitter = bayer + (hash2(x, y, seed) - bayer) * p.randomness

      const id = pickModule(ramp, d, jitter, p.hardness, (x + y) & 1, p.coherence)
      module[i] = id
      if (id === EMPTY) continue

      let c = inkColor(ctx, t, r)
      if (useImgColor) {
        // El color de la foto, o el de la paleta más cercano, o algo entre los
        // dos: en el medio la imagen se reconoce pero queda impresa con las
        // tintas del sistema.
        const photo = (img.color[i] | 0xff000000) >>> 0
        const quantized = nearestInPalette(colors, photo)
        c = lerpPacked(
          c,
          lerpPacked(photo, quantized, p.imageColorQuantize),
          p.imageColorAmount,
        )
      }
      ink[i] = c
    }
  }

  return { w: W, h: H, scale, module, ink, paper: ctx.paper }
}
