import { useEffect, useRef, useState } from 'react'
import { compose } from '../engine/compose'
import { rasterize } from '../engine/raster'
import type { ImageSource } from '../engine/source'
import type { Params } from '../state/params'

/**
 * El canvas se dimensiona a un múltiplo entero del bitmap y se amplía por
 * vecino más cercano. Con zoom entero cada subcelda mide exactamente lo mismo;
 * con un factor fraccionario unas medirían 2px y otras 3, y la trama —que es
 * todo el punto de esto— se vería irregular.
 */
export function Viewport({
  params,
  source,
  onDrop,
}: {
  params: Params
  source: ImageSource | null
  onDrop: (file: File) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 900, h: 900 })
  const [info, setInfo] = useState({ ms: 0, w: 0, h: 0 })
  const [over, setOver] = useState(false)

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

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const t0 = performance.now()
    const grid = compose(params, source)
    const bm = rasterize(grid, 1)

    const zoom = Math.max(1, Math.floor(Math.min(box.w / bm.w, box.h / bm.h)))
    const outW = bm.w * zoom
    const outH = bm.h * zoom

    canvas.width = outW
    canvas.height = outH
    canvas.style.width = `${outW}px`
    canvas.style.height = `${outH}px`

    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingEnabled = false

    const img = ctx.createImageData(bm.w, bm.h)
    new Uint32Array(img.data.buffer).set(bm.buf)

    if (zoom === 1) {
      ctx.putImageData(img, 0, 0)
    } else {
      // putImageData ignora las transformaciones, así que el escalado entero
      // pasa por un canvas intermedio.
      const src = document.createElement('canvas')
      src.width = bm.w
      src.height = bm.h
      src.getContext('2d')!.putImageData(img, 0, 0)
      ctx.drawImage(src, 0, 0, outW, outH)
    }

    setInfo({ ms: performance.now() - t0, w: grid.w, h: grid.h })
  }, [params, source, box])

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setOver(false)
    const file = e.dataTransfer.files[0]
    if (file?.type.startsWith('image/')) onDrop(file)
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
      {!source && <div className="hint">Arrastrá una imagen, o pegala con ⌘V</div>}
    </div>
  )
}
