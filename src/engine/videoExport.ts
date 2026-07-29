/**
 * Export de video.
 *
 * Dos rutas, y la diferencia entre ellas importa:
 *
 * - **WebM/VP9 por WebCodecs.** El timestamp de cada cuadro lo fijamos
 *   nosotros, así que componer puede tardar lo que necesite y el video sale
 *   igual a la velocidad pedida. Es la ruta buena.
 *
 * - **MP4/H.264 por MediaRecorder.** No hay forma de fijar timestamps: marca
 *   cada cuadro con el reloj de pared, así que si el render no llega a los fps
 *   pedidos el resultado sale en cámara lenta. Está sólo por compatibilidad, y
 *   avisamos cuando se queda corto.
 *
 * Sobre calidad, medido con el peor caso de este motor —damero de 1px y bordes
 * de color saturado—: a 1px por subcelda ningún codec sobrevive, los tres dan
 * el mismo error y la trama se vuelve gris. A 2px VP9 baja a un error medio de
 * 1.5 mientras H.264 y AV1 se quedan en 26. Por eso VP9 es el recomendado y
 * por eso avisamos cuando la resolución elegida deja la subcelda por debajo
 * de 2px: eso no lo arregla ningún codec, se arregla exportando más grande.
 */

import { compose } from './compose'
import { rasterize } from './raster'
import { WebMWriter } from './webm'
import type { VideoSource } from './videoSource'
import type { Params } from '../state/params'

export type VideoFormat = 'webm' | 'mp4'

export interface VideoExportOptions {
  format: VideoFormat
  fps: 30 | 60
  px: number
  from: number
  to: number
  bitrate: number
  transparent: boolean
}

export interface ExportProgress {
  frame: number
  total: number
  /** Sólo en MP4: los fps reales que se están consiguiendo. */
  realFps?: number
}

export const isWebCodecsAvailable = () => typeof VideoEncoder !== 'undefined'

/** Debajo de esto la trama se pierde y no hay codec que la salve. */
export const MIN_SAFE_PX = 2

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

/** Dibuja un cuadro ya compuesto sobre el canvas de salida. */
function renderFrame(
  p: Params,
  src: VideoSource,
  opts: VideoExportOptions,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
): void {
  const grid = compose(p, src)
  if (opts.transparent) grid.paper = 0
  const bm = rasterize(grid, opts.px)
  if (canvas.width !== bm.w || canvas.height !== bm.h) {
    canvas.width = bm.w
    canvas.height = bm.h
  }
  const img = ctx.createImageData(bm.w, bm.h)
  new Uint32Array(img.data.buffer).set(bm.buf)
  ctx.putImageData(img, 0, 0)
}

/**
 * WebM/VP9 por WebCodecs. Compone cuadro a cuadro sin mirar el reloj: cada
 * cuadro lleva el timestamp que le toca, no el momento en que se terminó.
 */
async function exportWebM(
  p: Params,
  src: VideoSource,
  opts: VideoExportOptions,
  onProgress: (x: ExportProgress) => void,
  signal: AbortSignal,
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!

  // Un cuadro para conocer las dimensiones antes de configurar el encoder.
  await src.seek(opts.from)
  renderFrame(p, src, opts, canvas, ctx)

  // VP9 exige dimensiones pares.
  const w = canvas.width - (canvas.width % 2)
  const h = canvas.height - (canvas.height % 2)

  const writer = new WebMWriter(w, h)
  const chunks: { data: Uint8Array; timeMs: number; key: boolean }[] = []

  const encoder = new VideoEncoder({
    output: (chunk) => {
      const data = new Uint8Array(chunk.byteLength)
      chunk.copyTo(data)
      chunks.push({
        data,
        timeMs: Math.round(chunk.timestamp / 1000),
        key: chunk.type === 'key',
      })
    },
    error: (e) => {
      throw e
    },
  })

  encoder.configure({
    codec: 'vp09.00.10.08',
    width: w,
    height: h,
    bitrate: opts.bitrate,
    framerate: opts.fps,
    latencyMode: 'quality',
  })

  const total = Math.max(1, Math.round((opts.to - opts.from) * opts.fps))
  const step = 1 / opts.fps

  for (let i = 0; i < total; i++) {
    if (signal.aborted) {
      encoder.close()
      throw new DOMException('Cancelado', 'AbortError')
    }

    await src.seek(opts.from + i * step)
    renderFrame(p, src, opts, canvas, ctx)

    const frame = new VideoFrame(canvas, {
      timestamp: Math.round((i * 1e6) / opts.fps),
      duration: Math.round(1e6 / opts.fps),
    })
    // Una clave cada dos segundos: permite buscar sin inflar el archivo.
    encoder.encode(frame, { keyFrame: i % (opts.fps * 2) === 0 })
    frame.close()

    // Sin esto la cola crece sin control y se dispara la memoria.
    if (encoder.encodeQueueSize > 8) {
      await new Promise<void>((r) => {
        const check = () => (encoder.encodeQueueSize <= 4 ? r() : setTimeout(check, 8))
        check()
      })
    }

    onProgress({ frame: i + 1, total })
  }

  await encoder.flush()
  encoder.close()

  for (const c of chunks) writer.addFrame(c)
  return writer.finish(1000 / opts.fps)
}

/**
 * MP4/H.264 por MediaRecorder. Va en tiempo real por fuerza, así que aquí sí
 * hay que seguirle el paso al reloj; si no se llega, se avisa.
 */
async function exportMP4(
  p: Params,
  src: VideoSource,
  opts: VideoExportOptions,
  onProgress: (x: ExportProgress) => void,
  signal: AbortSignal,
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!

  await src.seek(opts.from)
  renderFrame(p, src, opts, canvas, ctx)

  const mime = MediaRecorder.isTypeSupported('video/mp4;codecs=avc1.640028')
    ? 'video/mp4;codecs=avc1.640028'
    : 'video/mp4'

  const stream = canvas.captureStream(0)
  const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: opts.bitrate })
  const parts: Blob[] = []
  rec.ondataavailable = (e) => e.data.size && parts.push(e.data)
  rec.start()

  const total = Math.max(1, Math.round((opts.to - opts.from) * opts.fps))
  const step = 1 / opts.fps
  const frameMs = 1000 / opts.fps
  const t0 = performance.now()

  for (let i = 0; i < total; i++) {
    if (signal.aborted) {
      rec.stop()
      throw new DOMException('Cancelado', 'AbortError')
    }

    await src.seek(opts.from + i * step)
    renderFrame(p, src, opts, canvas, ctx)
    track.requestFrame()

    // Esperar hasta que toque el próximo cuadro. Si el render ya se pasó, se
    // sigue de largo — y ahí el video se alarga, que es la limitación de esta
    // ruta.
    const target = t0 + (i + 1) * frameMs
    const wait = target - performance.now()
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))

    const elapsed = (performance.now() - t0) / 1000
    onProgress({ frame: i + 1, total, realFps: (i + 1) / elapsed })
  }

  await new Promise<void>((r) => {
    rec.onstop = () => r()
    rec.stop()
  })
  return new Blob(parts, { type: 'video/mp4' })
}

export async function exportVideo(
  p: Params,
  src: VideoSource,
  opts: VideoExportOptions,
  onProgress: (x: ExportProgress) => void,
  signal: AbortSignal,
): Promise<void> {
  const wasPlaying = src.playing
  src.pause()
  try {
    const blob =
      opts.format === 'webm' && isWebCodecsAvailable()
        ? await exportWebM(p, src, opts, onProgress, signal)
        : await exportMP4(p, src, opts, onProgress, signal)
    const ext = opts.format === 'webm' ? 'webm' : 'mp4'
    download(blob, `pixelator_${p.seed}_${opts.fps}fps.${ext}`)
  } finally {
    if (wasPlaying) src.play()
  }
}
