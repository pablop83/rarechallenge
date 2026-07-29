/**
 * Deformaciones del dominio. Se aplican a la coordenada antes de muestrear el
 * campo, así que doblan la composición entera —densidad y color a la vez— en
 * lugar de mover píxeles ya resueltos. La grilla nunca se rompe: lo que se
 * deforma es de dónde lee cada celda, no dónde se dibuja.
 */

import type { Distortion } from '../state/params'
import type { Noise } from './noise'

const scratch = new Float64Array(2)

export function warp(
  mode: Distortion,
  x: number,
  y: number,
  strength: number,
  noise: Noise,
  out: Float64Array,
): void {
  if (mode === 'none' || strength === 0) {
    out[0] = x
    out[1] = y
    return
  }

  const dx = x - 0.5
  const dy = y - 0.5

  switch (mode) {
    case 'wave':
      out[0] = x + Math.sin(y * Math.PI * 4) * strength * 0.25
      out[1] = y + Math.sin(x * Math.PI * 3) * strength * 0.18
      return

    case 'swirl': {
      const r = Math.sqrt(dx * dx + dy * dy)
      const a = Math.atan2(dy, dx) + (1 - r) * strength * 4
      out[0] = 0.5 + Math.cos(a) * r
      out[1] = 0.5 + Math.sin(a) * r
      return
    }

    case 'vortex': {
      // El giro cae con 1/r: el centro se enrosca fuerte y el borde queda casi
      // quieto.
      const r = Math.sqrt(dx * dx + dy * dy) + 1e-4
      const a = Math.atan2(dy, dx) + (strength * 0.35) / r
      out[0] = 0.5 + Math.cos(a) * r
      out[1] = 0.5 + Math.sin(a) * r
      return
    }

    case 'curl': {
      noise.curl(x * 2.5, y * 2.5, scratch)
      out[0] = x + scratch[0] * strength * 0.5
      out[1] = y + scratch[1] * strength * 0.5
      return
    }

    case 'turbulence': {
      out[0] = x + noise.fbm(x * 3, y * 3, 4) * strength * 0.4
      out[1] = y + noise.fbm(x * 3 + 41.7, y * 3 - 19.3, 4) * strength * 0.4
      return
    }
  }
}
