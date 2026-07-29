/**
 * Presets. Se guardan en el navegador y se pueden bajar e importar como .json.
 *
 * Por defecto un preset guarda el estilo pero no la semilla ni la resolución de
 * grilla, así que aplicarlo sobre lo que tengas cambia el look sin pisar la
 * composición — podés seguir tirando semillas con el mismo estilo puesto. Al
 * guardar se puede incluirlas si lo que querés es marcar una pieza concreta.
 *
 * Ningún preset guarda la imagen: son parámetros, no archivos.
 */

import { DEFAULTS, type Params } from './params'

export interface Preset {
  name: string
  params: Partial<Params>
  builtin?: boolean
}

/**
 * Lo que define la pieza concreta, por oposición al estilo. La proporción va
 * acá y no en el estilo: es una decisión de formato, como la resolución, y si
 * viajara con el preset aplicar un look te reencuadraría el lienzo.
 */
const COMPOSITION_KEYS = ['seed', 'grid', 'aspect', 'fit'] as const

const STORAGE_KEY = 'pixelator.presets.v1'

export function extractPreset(p: Params, includeComposition: boolean): Partial<Params> {
  const out: Partial<Params> = { ...p }
  if (!includeComposition) {
    for (const k of COMPOSITION_KEYS) delete out[k]
  }
  return out
}

export function applyPreset(current: Params, preset: Preset): Params {
  return { ...current, ...preset.params }
}

export function loadPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isPreset) : []
  } catch {
    // Un localStorage corrupto no debería impedir abrir la app.
    return []
  }
}

export function savePresets(list: Preset[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
}

function isPreset(v: unknown): v is Preset {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as Preset).name === 'string' &&
    typeof (v as Preset).params === 'object' &&
    (v as Preset).params !== null
  )
}

/** Se queda sólo con claves que existen en Params, por si el .json es viejo. */
export function sanitize(list: Preset[]): Preset[] {
  const keys = new Set(Object.keys(DEFAULTS))
  return list.map((pr) => {
    const params: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(pr.params)) {
      if (keys.has(k)) params[k] = v
    }
    return { name: pr.name, params: params as Partial<Params> }
  })
}

export function exportPresets(list: Preset[]): void {
  const blob = new Blob([JSON.stringify(list, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'pixelator-presets.json'
  a.click()
  URL.revokeObjectURL(url)
}

export async function importPresets(file: File): Promise<Preset[]> {
  const parsed = JSON.parse(await file.text())
  if (!Array.isArray(parsed)) throw new Error('El archivo no es una lista de presets')
  return sanitize(parsed.filter(isPreset))
}

/** Presets de fábrica, para tener de dónde partir. */
export const BUILTIN: Preset[] = [
  {
    name: 'Cartel',
    builtin: true,
    params: {
      generator: 'noise',
      fieldScale: 2.5,
      octaves: 3,
      density: 0.5,
      contrast: 2.6,
      hardness: 0.25,
      randomness: 0.35,
      coherence: 0.75,
      minScale: 1,
      maxScale: 3,
      scaleAmount: 0.45,
      scaleFlatness: 0.6,
      symmetry: 'none',
      distortion: 'none',
      mask: 'none',
      colorMode: 'palette',
      palette: 'iaac',
      colorScale: 3,
      colorClustering: 0.85,
    },
  },
  {
    name: 'Cianotipo',
    builtin: true,
    params: {
      generator: 'voronoi',
      fieldScale: 3.5,
      octaves: 3,
      density: 0.46,
      contrast: 3.2,
      hardness: 0.15,
      randomness: 0.3,
      coherence: 0.85,
      minScale: 1,
      maxScale: 2,
      scaleAmount: 0.3,
      scaleFlatness: 0.7,
      symmetry: 'none',
      distortion: 'none',
      mask: 'blob',
      maskSize: 0.9,
      maskFeather: 0.2,
      colorMode: 'palette',
      palette: 'blueprint',
      colorScale: 2,
      colorClustering: 0.6,
    },
  },
  {
    name: 'Trama fina',
    builtin: true,
    params: {
      generator: 'ridged',
      fieldScale: 4,
      octaves: 4,
      density: 0.52,
      contrast: 2,
      hardness: 0.6,
      randomness: 0,
      coherence: 1,
      minScale: 1,
      maxScale: 1,
      scaleAmount: 0,
      symmetry: 'none',
      distortion: 'none',
      mask: 'none',
      colorMode: 'mono',
      ink: '#111111',
      paper: '#ffffff',
    },
  },
  {
    name: 'Riso',
    builtin: true,
    params: {
      generator: 'flow',
      fieldScale: 3,
      octaves: 3,
      density: 0.54,
      contrast: 2.2,
      hardness: 0.2,
      randomness: 0.55,
      coherence: 0.5,
      minScale: 1,
      maxScale: 3,
      scaleAmount: 0.6,
      scaleFlatness: 0.5,
      symmetry: 'none',
      distortion: 'curl',
      distortStrength: 0.35,
      mask: 'none',
      colorMode: 'palette',
      palette: 'risograph',
      colorScale: 4,
      colorClustering: 0.7,
    },
  },
  {
    name: 'Rosetón',
    builtin: true,
    params: {
      generator: 'distance',
      fieldScale: 6,
      octaves: 2,
      attractors: 1,
      density: 0.5,
      contrast: 2.4,
      hardness: 0.35,
      randomness: 0.2,
      coherence: 0.9,
      minScale: 1,
      maxScale: 3,
      scaleAmount: 0.5,
      scaleFlatness: 0.65,
      symmetry: 'kaleidoscope',
      distortion: 'swirl',
      distortStrength: 0.25,
      mask: 'circle',
      maskSize: 0.95,
      maskFeather: 0.15,
      colorMode: 'palette',
      palette: 'plotter',
      colorScale: 3,
      colorClustering: 0.8,
    },
  },
]
