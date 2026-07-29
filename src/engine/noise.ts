/**
 * Simplex 2D con tabla de permutación derivada de la semilla, más fbm y curl.
 * Es la fuente de todos los campos continuos del motor.
 */

import { mulberry32 } from './rng'

const F2 = 0.5 * (Math.sqrt(3) - 1)
const G2 = (3 - Math.sqrt(3)) / 6

const GRAD = new Float32Array([1, 1, -1, 1, 1, -1, -1, -1, 1, 0, -1, 0, 0, 1, 0, -1])

export class Noise {
  private perm = new Uint8Array(512)
  private permMod8 = new Uint8Array(512)

  constructor(seed: number) {
    const rnd = mulberry32(seed)
    const p = new Uint8Array(256)
    for (let i = 0; i < 256; i++) p[i] = i
    for (let i = 255; i > 0; i--) {
      const j = (rnd() * (i + 1)) | 0
      const t = p[i]
      p[i] = p[j]
      p[j] = t
    }
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255]
      this.permMod8[i] = this.perm[i] % 8
    }
  }

  /** Simplex 2D en [-1, 1]. */
  noise2(xin: number, yin: number): number {
    const s = (xin + yin) * F2
    const i = Math.floor(xin + s)
    const j = Math.floor(yin + s)
    const t = (i + j) * G2
    const x0 = xin - (i - t)
    const y0 = yin - (j - t)

    const i1 = x0 > y0 ? 1 : 0
    const j1 = x0 > y0 ? 0 : 1

    const x1 = x0 - i1 + G2
    const y1 = y0 - j1 + G2
    const x2 = x0 - 1 + 2 * G2
    const y2 = y0 - 1 + 2 * G2

    const ii = i & 255
    const jj = j & 255

    let n = 0

    let t0 = 0.5 - x0 * x0 - y0 * y0
    if (t0 > 0) {
      const g = this.permMod8[ii + this.perm[jj]] * 2
      t0 *= t0
      n += t0 * t0 * (GRAD[g] * x0 + GRAD[g + 1] * y0)
    }

    let t1 = 0.5 - x1 * x1 - y1 * y1
    if (t1 > 0) {
      const g = this.permMod8[ii + i1 + this.perm[jj + j1]] * 2
      t1 *= t1
      n += t1 * t1 * (GRAD[g] * x1 + GRAD[g + 1] * y1)
    }

    let t2 = 0.5 - x2 * x2 - y2 * y2
    if (t2 > 0) {
      const g = this.permMod8[ii + 1 + this.perm[jj + 1]] * 2
      t2 *= t2
      n += t2 * t2 * (GRAD[g] * x2 + GRAD[g + 1] * y2)
    }

    return 70 * n
  }

  /** Ruido fractal. Devuelve [-1, 1] aproximado. */
  fbm(x: number, y: number, octaves: number, lacunarity = 2, gain = 0.5): number {
    let sum = 0
    let amp = 1
    let norm = 0
    let fx = x
    let fy = y
    for (let o = 0; o < octaves; o++) {
      sum += amp * this.noise2(fx, fy)
      norm += amp
      amp *= gain
      fx *= lacunarity
      fy *= lacunarity
    }
    return norm > 0 ? sum / norm : 0
  }

  /** fbm remapeado a [0, 1], que es lo que consumen los campos. */
  fbm01(x: number, y: number, octaves: number, lacunarity = 2, gain = 0.5): number {
    return this.fbm(x, y, octaves, lacunarity, gain) * 0.5 + 0.5
  }

  /**
   * Ruido con pliegue en valor absoluto: produce crestas y filamentos en vez de
   * manchas blandas. Da texturas mucho más gráficas que el fbm liso.
   */
  ridged(x: number, y: number, octaves: number): number {
    let sum = 0
    let amp = 1
    let norm = 0
    let fx = x
    let fy = y
    for (let o = 0; o < octaves; o++) {
      const n = 1 - Math.abs(this.noise2(fx, fy))
      sum += amp * n * n
      norm += amp
      amp *= 0.5
      fx *= 2
      fy *= 2
    }
    return norm > 0 ? sum / norm : 0
  }

  /**
   * Curl del campo de ruido: un vector incompresible, o sea sin fuentes ni
   * sumideros. Las líneas de flujo se cierran sobre sí mismas y por eso
   * orientan bien sin acumularse en un punto.
   */
  curl(x: number, y: number, out: Float64Array, eps = 0.01): void {
    const n1 = this.noise2(x, y + eps)
    const n2 = this.noise2(x, y - eps)
    const n3 = this.noise2(x + eps, y)
    const n4 = this.noise2(x - eps, y)
    out[0] = (n1 - n2) / (2 * eps)
    out[1] = -(n3 - n4) / (2 * eps)
  }
}
