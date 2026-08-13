import { useCallback, useEffect, useRef, useState } from 'react'
import { compose } from '../engine/compose'
import { rasterize } from '../engine/raster'
import type { Source } from '../engine/source'
import { VideoSource } from '../engine/videoSource'
import type { Params } from '../state/params'

/**
 * El canvas se dimensiona a un múltiplo entero del bitmap y se amplía por
 * vecino más cercano. Con zoom entero cada subcelda mide exactamente lo mismo;
 * con un factor fraccionario unas medirían 2px y otras 3, y la trama —que es
 * todo el punto de esto— se vería irregular.
 *
 * Con un video reproduciéndose se recompone en cada cuadro. Si componer tarda
 * más que un cuadro se saltan los que hagan falta: el preview prioriza ver el
 * movimiento, y el export —que sí es cuadro a cuadro— no depende de esto.
 */
export function Viewport({
  params,
  source,
  onDrop,
  redrawKey,
}: {
  params: Params
  source: Source | null
  onDrop: (file: File) => void
  /** Cambia cuando algo fuera de `params` (p.ej. una paleta editada) exige recomponer. */
  redrawKey?: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 900, h: 900 })
  const [info, setInfo] = useState({ ms: 0, w: 0, h: 0 })
  const [over, setOver] = useState(false)

  // El bucle de video lee de acá para no recrear la suscripción en cada cambio.
  const paramsRef = useRef(params)
  paramsRef.current = params
  const boxRef2 = useRef(box)
  boxRef2.current = box

  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect
      setBox({ w: Math.max(120, width), h: Math.max(120, height) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const t0 = performance.now()
    const grid = compose(paramsRef.current, source)
    const bm = rasterize(grid, 1)

    const b = boxRef2.current
    const zoom = Math.max(1, Math.floor(Math.min(b.w / bm.w, b.h / bm.h)))
    const outW = bm.w * zoom
    const outH = bm.h * zoom

    if (canvas.width !== outW || canvas.height !== outH) {
      canvas.width = outW
      canvas.height = outH
      canvas.style.width = `${outW}px`
      canvas.style.height = `${outH}px`
    }

    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingEnabled = false

    const img = ctx.createImageData(bm.w, bm.h)
    new Uint32Array(img.data.buffer).set(bm.buf)

    if (zoom === 1) {
      ctx.putImageData(img, 0, 0)
    } else {
      // putImageData ignora las transformaciones, así que el escalado entero
      // pasa por un canvas intermedio.
      const tmp = document.createElement('canvas')
      tmp.width = bm.w
      tmp.height = bm.h
      tmp.getContext('2d')!.putImageData(img, 0, 0)
      ctx.drawImage(tmp, 0, 0, outW, outH)
    }

    setInfo({ ms: performance.now() - t0, w: grid.w, h: grid.h })
  }, [source])

  useEffect(() => {
    draw()
  }, [draw, params, box, redrawKey])

  // Con video, recomponer en cada cuadro nuevo.
  useEffect(() => {
    if (!(source instanceof VideoSource)) return
    return source.onFrame(() => draw())
  }, [source, draw])

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setOver(false)
    const file = e.dataTransfer.files[0]
    if (file && (file.type.startsWith('image/') || file.type.startsWith('video/'))) {
      onDrop(file)
    }
  }

  return (
    <div
      className={`viewport${over ? ' over' : ''}`}
      ref={boxRef}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={handleDrop}
    >
      <canvas ref={canvasRef} />
      <div className="readout">
        {info.w}×{info.h} · {(info.w * info.h).toLocaleString('es')} celdas
        {source ? ` · ${source.name}` : ''} · {info.ms.toFixed(0)} ms
      </div>
      {!source && <div className="hint">Arrastrá una imagen o un video, o pegá con ⌘V</div>}
    </div>
  )
}
