/**
 * Video de origen. Como el motor sólo pide "el cuadro de ahora", un video es
 * una fuente igual que una foto: entra por la misma interfaz y admite las
 * mismas distorsiones, máscaras y simetrías.
 *
 * Todo pasa en el navegador: el video nunca sale de la máquina.
 */

import { sampleDrawable, type SampledImage, type Source } from './source'
import type { Fit } from '../state/params'

/** Cuadros por segundo que ofrecemos, por pedido del brief. */
export type Fps = 30 | 60

export class VideoSource implements Source {
  readonly name: string
  readonly width: number
  readonly height: number
  readonly aspect: number
  readonly isVideo = true
  readonly duration: number

  readonly el: HTMLVideoElement
  private url: string
  private cache: SampledImage | null = null
  private cacheKey = ''

  private constructor(el: HTMLVideoElement, url: string, name: string) {
    this.el = el
    this.url = url
    this.name = name
    this.width = el.videoWidth
    this.height = el.videoHeight
    this.aspect = el.videoWidth / el.videoHeight
    this.duration = el.duration
  }

  static async fromBlob(blob: Blob, name: string): Promise<VideoSource> {
    const url = URL.createObjectURL(blob)
    const el = document.createElement('video')
    el.src = url
    el.muted = true
    el.playsInline = true
    el.preload = 'auto'
    // `loadeddata` garantiza que hay un cuadro dibujable, no sólo metadatos:
    // sin eso el primer drawImage saldría en negro.
    await new Promise<void>((res, rej) => {
      el.onloadeddata = () => res()
      el.onerror = () => rej(new Error('No se pudo leer el video'))
      setTimeout(() => rej(new Error('El video tardó demasiado en cargar')), 30000)
    })
    if (!el.videoWidth || !el.duration || !isFinite(el.duration)) {
      URL.revokeObjectURL(url)
      throw new Error('El archivo no tiene pista de video legible')
    }
    return new VideoSource(el, url, name)
  }

  get currentTime(): number {
    return this.el.currentTime
  }

  get playing(): boolean {
    return !this.el.paused && !this.el.ended
  }

  /**
   * Salta a un instante exacto y espera a que el cuadro esté dibujable. Es lo
   * que permite exportar de forma determinista: sin esperar el `seeked`,
   * drawImage devolvería el cuadro anterior.
   */
  async seek(t: number): Promise<void> {
    const target = Math.max(0, Math.min(t, this.duration - 1e-3))
    if (Math.abs(this.el.currentTime - target) < 1e-6) return
    await new Promise<void>((res) => {
      const done = () => {
        this.el.removeEventListener('seeked', done)
        res()
      }
      this.el.addEventListener('seeked', done)
      this.el.currentTime = target
      // Un seek a un instante ya presente puede no emitir el evento.
      setTimeout(done, 3000)
    })
    this.invalidate()
  }

  play() {
    void this.el.play()
  }

  pause() {
    this.el.pause()
  }

  /** El cuadro cambió: la próxima muestra tiene que recalcularse. */
  invalidate() {
    this.cacheKey = ''
  }

  /**
   * Avisa cuando haya un cuadro nuevo dibujable. Usa requestVideoFrameCallback
   * cuando existe —dispara una vez por cuadro real, no por repintado— y cae a
   * rAF si no. Devuelve la función para cancelar.
   */
  onFrame(cb: () => void): () => void {
    const el = this.el as HTMLVideoElement & {
      requestVideoFrameCallback?: (c: () => void) => number
      cancelVideoFrameCallback?: (h: number) => void
    }
    let stop = false
    if (typeof el.requestVideoFrameCallback === 'function') {
      let handle = 0
      const loop = () => {
        if (stop) return
        this.invalidate()
        cb()
        handle = el.requestVideoFrameCallback!(loop)
      }
      handle = el.requestVideoFrameCallback(loop)
      return () => {
        stop = true
        el.cancelVideoFrameCallback?.(handle)
      }
    }
    let raf = 0
    const loop = () => {
      if (stop) return
      this.invalidate()
      cb()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      stop = true
      cancelAnimationFrame(raf)
    }
  }

  sample(gw: number, gh: number, fit: Fit = 'cover'): SampledImage {
    const key = `${gw}x${gh}:${fit}:${this.el.currentTime}`
    if (this.cache && this.cacheKey === key) return this.cache
    this.cache = sampleDrawable(this.el, this.width, this.height, gw, gh, fit)
    this.cacheKey = key
    return this.cache
  }

  dispose() {
    this.el.pause()
    this.el.removeAttribute('src')
    this.el.load()
    URL.revokeObjectURL(this.url)
    this.cache = null
  }
}
