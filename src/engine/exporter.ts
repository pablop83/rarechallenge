/**
 * Export PNG. El bitmap se genera directamente al tamaño pedido en vez de
 * reescalar el preview, así que no hay interpolación en ningún punto: la
 * composición del preview y la del archivo son la misma, sólo cambia cuántos
 * píxeles mide cada subcelda.
 */

import { compose, gridFor } from './compose'
import { rasterize, toCanvas } from './raster'
import { RES } from './modules'
import type { Source } from './source'
import type { Params } from '../state/params'

/** Los canvas tienen límite de lado y de área; nos quedamos cómodos por debajo. */
const MAX_SIDE = 12000

/** Tamaños de subcelda posibles y las dimensiones que produce cada uno. */
export function exportOptions(
  p: Params,
  source: { aspect: number } | null,
): { px: number; w: number; h: number }[] {
  const [gw, gh] = gridFor(p, source)
  const out: { px: number; w: number; h: number }[] = []
  for (const px of [1, 2, 4, 6, 8, 12, 16]) {
    const w = gw * RES * px
    const h = gh * RES * px
    if (Math.max(w, h) <= MAX_SIDE) out.push({ px, w, h })
  }
  return out
}

export async function exportPNG(
  p: Params,
  src: Source | null,
  px: number,
  transparent: boolean,
): Promise<void> {
  const grid = compose(p, src)
  if (transparent) grid.paper = 0

  const bm = rasterize(grid, px)
  const canvas = toCanvas(bm)

  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'))
  if (!blob) throw new Error('No se pudo generar el PNG')

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `pixelator_${p.seed}_${bm.w}x${bm.h}.png`
  a.click()
  URL.revokeObjectURL(url)
}
