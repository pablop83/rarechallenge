/**
 * Los campos escalares que deciden la densidad. Todos reciben coordenadas
 * normalizadas ya deformadas y devuelven [0, 1].
 *
 * Que la composición salga de un campo continuo y no de tiradas por celda es lo
 * que hace que se lea como diseñada: las celdas vecinas comparten valor, así
 * que los módulos y los colores se agrupan solos.
 */

import { Noise } from './noise'
import { mulberry32, clamp, hash2 } from './rng'
import type { Generator } from '../state/params'

const scratch = new Float64Array(2)

export interface FieldConfig {
  generator: Generator
  scale: number
  octaves: number
  attractors: number
  seed: number
}

export class Field {
  private noise: Noise
  private warpNoise: Noise
  private pts: Float32Array = new Float32Array(0)
  private cfg: FieldConfig

  constructor(cfg: FieldConfig) {
    this.cfg = cfg
    this.noise = new Noise(cfg.seed)
    this.warpNoise = new Noise(cfg.seed ^ 0x9e3779b9)

    // Atractores para los campos de distancia y de Voronoi.
    const n = Math.max(1, cfg.attractors)
    const rnd = mulberry32(cfg.seed ^ 0x5bf03635)
    this.pts = new Float32Array(n * 2)
    for (let i = 0; i < n; i++) {
      this.pts[i * 2] = rnd()
      this.pts[i * 2 + 1] = rnd()
    }
  }

  /** Valor del campo en coordenadas normalizadas [0,1]. */
  sample(x: number, y: number): number {
    const s = this.cfg.scale
    switch (this.cfg.generator) {
      case 'noise':
        return this.noise.fbm01(x * s, y * s, this.cfg.octaves)

      case 'ridged':
        return this.noise.ridged(x * s, y * s, this.cfg.octaves)

      case 'distance': {
        // Distancia al atractor más cercano, plegada en anillos concéntricos.
        let best = Infinity
        for (let i = 0; i < this.pts.length; i += 2) {
          const dx = x - this.pts[i]
          const dy = y - this.pts[i + 1]
          const d = Math.sqrt(dx * dx + dy * dy)
          if (d < best) best = d
        }
        const banded = Math.cos(best * s * Math.PI * 2) * 0.5 + 0.5
        const falloff = clamp(1 - best * 1.4, 0, 1)
        return banded * 0.45 + falloff * 0.55
      }

      case 'flow': {
        // Fase a lo largo de las líneas de curl: bandas que fluyen y se doblan.
        this.warpNoise.curl(x * s * 0.5, y * s * 0.5, scratch)
        const phase = (x * scratch[0] + y * scratch[1]) * s * 3
        const band = Math.sin(phase * Math.PI) * 0.5 + 0.5
        const body = this.noise.fbm01(x * s, y * s, Math.max(2, this.cfg.octaves - 1))
        return band * 0.55 + body * 0.45
      }

      case 'voronoi': {
        // F2 - F1: interiores planos y bordes marcados. Los interiores planos
        // son justamente donde el sistema de escala coloca los módulos grandes.
        let f1 = Infinity
        let f2 = Infinity
        const jx = Math.floor(x * s)
        const jy = Math.floor(y * s)
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            const cx = jx + ox
            const cy = jy + oy
            const h = this.warpNoise.noise2(cx * 13.7, cy * 7.3) * 0.5 + 0.5
            const h2 = this.warpNoise.noise2(cx * 5.1 + 31, cy * 11.9 - 17) * 0.5 + 0.5
            const px = (cx + h) / s
            const py = (cy + h2) / s
            const dx = x - px
            const dy = y - py
            const d = Math.sqrt(dx * dx + dy * dy)
            if (d < f1) {
              f2 = f1
              f1 = d
            } else if (d < f2) {
              f2 = d
            }
          }
        }
        return clamp((f2 - f1) * s * 1.2, 0, 1)
      }
    }
  }

  /**
   * Identificador de región. Sirve para que el color se agrupe en manchas
   * planas en vez de degradar continuamente.
   */
  regionId(x: number, y: number, scale: number): number {
    const jx = Math.floor(x * scale)
    const jy = Math.floor(y * scale)
    let best = Infinity
    let id = 0
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const cx = jx + ox
        const cy = jy + oy
        const h = this.warpNoise.noise2(cx * 13.7, cy * 7.3) * 0.5 + 0.5
        const h2 = this.warpNoise.noise2(cx * 5.1 + 31, cy * 11.9 - 17) * 0.5 + 0.5
        const dx = x - (cx + h) / scale
        const dy = y - (cy + h2) / scale
        const d = dx * dx + dy * dy
        if (d < best) {
          best = d
          // hash2 mezcla de verdad. Un producto suelto tipo cx*73856093 parece
          // un hash pero es lineal: con coordenadas chicas —y acá lo son, la
          // escala de color reparte la lámina en unas pocas regiones— devuelve
          // valores todos cerca de cero y la paleta colapsa en su primer color.
          id = hash2(cx, cy, this.cfg.seed)
        }
      }
    }
    return id
  }
}
