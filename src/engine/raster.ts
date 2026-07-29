/**
 * Rasterizador. Como cada módulo es una máscara de 3x3 bits, la composición
 * entera es un bitmap a 3x la resolución de la grilla: una grilla de 300 son
 * 900x900 píxeles y se escribe de una pasada en un Uint32Array.
 *
 * De ahí salen las tres propiedades que pedía el brief y que con texturas
 * habrían costado trabajo: cero antialias (nunca se interpola nada), bordes
 * duros a cualquier zoom (se amplía por vecino más cercano en múltiplos
 * enteros) y export a cualquier tamaño (subir `px` es exacto, no un reescalado).
 */

import { MODULE_BITS, EMPTY } from './modules'
import type { Grid } from './compose'

export interface Bitmap {
  buf: Uint32Array
  w: number
  h: number
}

/**
 * Dibuja la grilla en un Uint32Array de `w*3*px` por `h*3*px`.
 * `px` es el tamaño en píxeles de cada subcelda del módulo.
 */
export function rasterize(g: Grid, px: number): Bitmap {
  const w = g.w * 3 * px
  const h = g.h * 3 * px
  const buf = new Uint32Array(w * h)

  if (g.paper !== 0) buf.fill(g.paper)

  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      const i = y * g.w + x
      const s = g.scale[i]
      if (s === 0) continue // celda consumida por un módulo mayor

      const id = g.module[i]
      if (id === EMPTY) continue

      const bits = MODULE_BITS[id]
      const color = g.ink[i]

      // Un módulo de escala s ocupa s celdas, así que cada una de sus tres
      // divisiones mide s * px píxeles.
      const cell = s * px
      const ox = x * 3 * px
      const oy = y * 3 * px

      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          if (!((bits >> (row * 3 + col)) & 1)) continue

          const x0 = ox + col * cell
          const y0 = oy + row * cell
          for (let yy = 0; yy < cell; yy++) {
            const start = (y0 + yy) * w + x0
            buf.fill(color, start, start + cell)
          }
        }
      }
    }
  }

  return { buf, w, h }
}

/** Vuelca el bitmap en un canvas del mismo tamaño exacto. */
export function toCanvas(bm: Bitmap): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = bm.w
  c.height = bm.h
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(bm.w, bm.h)
  new Uint32Array(img.data.buffer).set(bm.buf)
  ctx.putImageData(img, 0, 0)
  return c
}
