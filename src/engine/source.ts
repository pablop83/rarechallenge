/**
 * Imagen de origen. Todo pasa en el navegador: la foto nunca sale de la máquina.
 *
 * La imagen se baja a la resolución de la grilla con `drawImage`, que promedia
 * al reducir, así que cada celda recibe el promedio real de la zona que le toca
 * y no una muestra puntual. De ahí salen las tres señales que consume el motor:
 * luminancia, bordes y color.
 */

import type { Fit } from '../state/params'

export interface SampledImage {
  gw: number
  gh: number
  /** Luminancia por celda, 0 = negro, 1 = blanco, ya compuesta sobre blanco. */
  lum: Float32Array
  /** Magnitud del gradiente, normalizada a 0..1. */
  edge: Float32Array
  /** Color promedio de la celda, empaquetado como ImageData. */
  color: Uint32Array
  /** Opacidad de la celda. Lo transparente no pinta, ni siquiera invertido. */
  alpha: Float32Array
}

/** Reparte un lado mayor entre ancho y alto respetando la proporción. */
export function gridDims(longSide: number, aspect: number): [number, number] {
  if (!isFinite(aspect) || aspect <= 0) return [longSide, longSide]
  return aspect >= 1
    ? [longSide, Math.max(4, Math.round(longSide / aspect))]
    : [Math.max(4, Math.round(longSide * aspect)), longSide]
}

export class ImageSource {
  readonly name: string
  readonly width: number
  readonly height: number
  readonly aspect: number

  private bitmap: ImageBitmap
  private cache: SampledImage | null = null
  private cacheFit: Fit | null = null

  private constructor(bitmap: ImageBitmap, name: string) {
    this.bitmap = bitmap
    this.name = name
    this.width = bitmap.width
    this.height = bitmap.height
    this.aspect = bitmap.width / bitmap.height
  }

  static async fromBlob(blob: Blob, name: string): Promise<ImageSource> {
    const bitmap = await createImageBitmap(blob)
    return new ImageSource(bitmap, name)
  }

  /** Muestrea a una grilla concreta. Se cachea: el remuestreo sólo hace falta
   *  cuando cambia la resolución o el encaje, no con cualquier otro slider. */
  sample(gw: number, gh: number, fit: Fit = 'cover'): SampledImage {
    if (this.cache && this.cache.gw === gw && this.cache.gh === gh && this.cacheFit === fit) {
      return this.cache
    }

    const canvas = document.createElement('canvas')
    canvas.width = gw
    canvas.height = gh
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    // Escalar por el eje que corresponda y centrar, en vez de estirar a la
    // grilla: si el lienzo tiene otra proporción que la foto, dibujarla a
    // gw×gh la deformaría. `cover` llena recortando lo que sobra; `contain`
    // entra entera y lo que queda alrededor es transparente, o sea papel.
    const iw = this.bitmap.width
    const ih = this.bitmap.height
    const s =
      fit === 'cover' ? Math.max(gw / iw, gh / ih) : Math.min(gw / iw, gh / ih)
    const dw = iw * s
    const dh = ih * s
    ctx.drawImage(this.bitmap, (gw - dw) / 2, (gh - dh) / 2, dw, dh)

    const n = gw * gh
    const alpha = new Float32Array(n)
    const transparent = ctx.getImageData(0, 0, gw, gh).data
    for (let i = 0; i < n; i++) alpha[i] = transparent[i * 4 + 3] / 255

    // Segunda lectura con blanco por debajo. Un PNG recortado guarda RGB (0,0,0)
    // donde es transparente, así que leer la luminancia en crudo interpreta el
    // fondo vacío como negro — o sea tinta máxima — y la composición sale
    // sembrada de módulos donde no había nada. Componerlo sobre blanco da el
    // tono que uno ve al abrir el archivo.
    ctx.globalCompositeOperation = 'destination-over'
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, gw, gh)
    ctx.globalCompositeOperation = 'source-over'

    const raw = ctx.getImageData(0, 0, gw, gh)
    const lum = new Float32Array(n)
    const color = new Uint32Array(n)
    color.set(new Uint32Array(raw.data.buffer))

    const d = raw.data
    for (let i = 0; i < n; i++) {
      const o = i * 4
      // Coeficientes de luminancia Rec. 709: el verde pesa diez veces más que
      // el azul, así que un umbral sobre el promedio plano rompería el tono.
      lum[i] = (0.2126 * d[o] + 0.7152 * d[o + 1] + 0.0722 * d[o + 2]) / 255
    }

    // Sobel sobre el mapa ya reducido. Calcularlo a resolución completa daría
    // detalle que la grilla no puede representar: lo que importa son los bordes
    // que sobreviven al downsampling, que son los que se van a poder dibujar.
    const edge = new Float32Array(n)
    let maxG = 0
    for (let y = 1; y < gh - 1; y++) {
      for (let x = 1; x < gw - 1; x++) {
        const i = y * gw + x
        const tl = lum[i - gw - 1], tc = lum[i - gw], tr = lum[i - gw + 1]
        const ml = lum[i - 1], mr = lum[i + 1]
        const bl = lum[i + gw - 1], bc = lum[i + gw], br = lum[i + gw + 1]
        const gx = tr + 2 * mr + br - (tl + 2 * ml + bl)
        const gy = bl + 2 * bc + br - (tl + 2 * tc + tr)
        const g = Math.sqrt(gx * gx + gy * gy)
        edge[i] = g
        if (g > maxG) maxG = g
      }
    }
    if (maxG > 0) {
      for (let i = 0; i < n; i++) edge[i] /= maxG
    }

    this.cache = { gw, gh, lum, edge, color, alpha }
    this.cacheFit = fit
    return this.cache
  }

  dispose() {
    this.bitmap.close()
    this.cache = null
  }
}
