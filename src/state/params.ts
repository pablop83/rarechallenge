export type Generator = 'noise' | 'ridged' | 'distance' | 'flow' | 'voronoi'
export type Symmetry =
  | 'none'
  | 'horizontal'
  | 'vertical'
  | 'quadrant'
  | 'radial'
  | 'kaleidoscope'
export type Distortion = 'none' | 'wave' | 'swirl' | 'vortex' | 'curl' | 'turbulence'
export type MaskShape = 'none' | 'circle' | 'rect' | 'blob'
export type ColorMode = 'mono' | 'duo' | 'palette' | 'gradientX' | 'gradientY' | 'radial' | 'noise'
export type Fit = 'cover' | 'contain'

/** Proporciones del lienzo. 'auto' toma la de la imagen, o 1:1 si no hay. */
export const ASPECTS: Record<string, number> = {
  auto: 0,
  '1:1': 1,
  '4:3': 4 / 3,
  '3:4': 3 / 4,
  '3:2': 3 / 2,
  '2:3': 2 / 3,
  '16:9': 16 / 9,
  '9:16': 9 / 16,
  A4: 210 / 297,
  'A4-h': 297 / 210,
}

export const ASPECT_LABELS: [string, string][] = [
  ['auto', 'Auto'],
  ['1:1', 'Cuadrado 1:1'],
  ['4:3', 'Apaisado 4:3'],
  ['3:4', 'Vertical 3:4'],
  ['3:2', 'Apaisado 3:2'],
  ['2:3', 'Vertical 2:3'],
  ['16:9', 'Apaisado 16:9'],
  ['9:16', 'Vertical 9:16'],
  ['A4', 'A4 vertical'],
  ['A4-h', 'A4 apaisado'],
]

/** Proporción efectiva: la elegida, o la de la imagen si es 'auto'. */
export function resolveAspect(aspect: string, source: { aspect: number } | null): number {
  const a = ASPECTS[aspect] ?? 0
  if (a > 0) return a
  return source ? source.aspect : 1
}

export interface Params {
  seed: string
  grid: number
  aspect: string
  fit: Fit

  generator: Generator
  fieldScale: number
  octaves: number
  attractors: number

  density: number
  contrast: number
  hardness: number
  randomness: number
  coherence: number

  minScale: number
  maxScale: number
  scaleAmount: number
  scaleFlatness: number

  symmetry: Symmetry

  distortion: Distortion
  distortStrength: number

  mask: MaskShape
  maskSize: number
  maskFeather: number

  colorMode: ColorMode
  palette: string
  colorScale: number
  colorClustering: number
  ink: string
  paper: string

  /** Cuánto manda la imagen sobre el campo procedural en la densidad. */
  imageAmount: number
  /** Luminancia (0) ↔ bordes (1) como señal de densidad. */
  imageEdges: number
  imageBrightness: number
  imageContrast: number
  imageInvert: boolean
  /** Cuánto manda la foto sobre el color procedural. */
  imageColorAmount: number
  /** Colores reales de la foto (0) ↔ cuantizados a la paleta (1). */
  imageColorQuantize: number
}

export const DEFAULTS: Params = {
  seed: 'iaac',
  grid: 120,
  aspect: 'auto',
  fit: 'cover',

  generator: 'noise',
  fieldScale: 2.5,
  octaves: 3,
  attractors: 3,

  // Contraste alto a propósito: empuja el campo hacia sus extremos, así quedan
  // masas grandes de sólido y de papel con la trama fina confinada a las
  // franjas de transición. Es la estructura de las referencias — bloques
  // rotundos que se disuelven en el borde, no un ruido parejo.
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
  distortStrength: 0.3,

  mask: 'none',
  maskSize: 0.8,
  maskFeather: 0.12,

  colorMode: 'palette',
  palette: 'iaac',
  colorScale: 3,
  colorClustering: 0.85,
  ink: '#000000',
  paper: '#ffffff',

  imageAmount: 1,
  imageEdges: 0.25,
  imageBrightness: 0.1,
  imageContrast: 1.8,
  imageInvert: false,
  imageColorAmount: 1,
  imageColorQuantize: 0.65,
}
