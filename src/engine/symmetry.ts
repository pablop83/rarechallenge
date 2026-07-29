/**
 * La simetría se aplica plegando las coordenadas antes de muestrear el campo,
 * no espejando el resultado. Sale gratis y es exacta a nivel de celda.
 *
 * Escribe en `out` en vez de devolver una tupla: esto corre una vez por celda,
 * o sea decenas de miles de veces por regeneración.
 */

import type { Symmetry } from '../state/params'

export function fold(mode: Symmetry, x: number, y: number, out: Float64Array): void {
  switch (mode) {
    case 'none':
      out[0] = x
      out[1] = y
      return

    case 'horizontal':
      out[0] = x < 0.5 ? x : 1 - x
      out[1] = y
      return

    case 'vertical':
      out[0] = x
      out[1] = y < 0.5 ? y : 1 - y
      return

    case 'quadrant':
      out[0] = x < 0.5 ? x : 1 - x
      out[1] = y < 0.5 ? y : 1 - y
      return

    case 'radial': {
      // Ocho sectores girando alrededor del centro.
      const dx = x - 0.5
      const dy = y - 0.5
      const r = Math.sqrt(dx * dx + dy * dy)
      const sector = Math.PI / 4
      const a = Math.abs(((Math.atan2(dy, dx) % sector) + sector) % sector)
      out[0] = 0.5 + Math.cos(a) * r
      out[1] = 0.5 + Math.sin(a) * r
      return
    }

    case 'kaleidoscope': {
      // Como radial pero con el ángulo replegado sobre sí mismo, así los
      // sectores encajan en espejo en vez de repetirse girados.
      const dx = x - 0.5
      const dy = y - 0.5
      const r = Math.sqrt(dx * dx + dy * dy)
      const sector = Math.PI / 3
      let a = ((Math.atan2(dy, dx) % sector) + sector) % sector
      if (a > sector / 2) a = sector - a
      out[0] = 0.5 + Math.cos(a) * r
      out[1] = 0.5 + Math.sin(a) * r
      return
    }
  }
}
