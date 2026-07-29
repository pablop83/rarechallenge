/**
 * Máscaras de forma. Devuelven cuánto vive cada celda: 1 dentro, 0 fuera y un
 * degradado en el borde. Ese degradado no recorta —modula la densidad—, así
 * que el contorno se deshilacha en checkers en vez de cortarse en escalera.
 */

import type { MaskShape } from '../state/params'
import type { Noise } from './noise'
import { clamp, smoothstep } from './rng'

export function maskAt(
  shape: MaskShape,
  x: number,
  y: number,
  size: number,
  feather: number,
  noise: Noise,
): number {
  if (shape === 'none') return 1

  const dx = x - 0.5
  const dy = y - 0.5
  const f = Math.max(feather, 1e-4)

  switch (shape) {
    case 'circle': {
      const r = Math.sqrt(dx * dx + dy * dy) / (size * 0.5)
      return smoothstep(clamp((1 - r) / f + 0.5, 0, 1))
    }

    case 'rect': {
      const half = size * 0.5
      const ex = (half - Math.abs(dx)) / f
      const ey = (half - Math.abs(dy)) / f
      return smoothstep(clamp(Math.min(ex, ey) + 0.5, 0, 1))
    }

    case 'blob': {
      // Círculo con el radio perturbado por ruido angular: una forma orgánica
      // cerrada, sin costura en el ángulo 0 porque se muestrea en el círculo.
      const a = Math.atan2(dy, dx)
      const r = Math.sqrt(dx * dx + dy * dy)
      const wob = noise.fbm(Math.cos(a) * 1.6, Math.sin(a) * 1.6, 3) * 0.28
      const edge = size * 0.5 * (1 + wob)
      return smoothstep(clamp((edge - r) / f + 0.5, 0, 1))
    }
  }
}
