/**
 * Muxer WebM mínimo para VP9.
 *
 * Hace falta porque MediaRecorder marca cada cuadro con el reloj de pared: si
 * componer un cuadro tarda 100ms, el video sale en cámara lenta. WebCodecs sí
 * deja fijar el timestamp de cada cuadro, pero entrega paquetes sueltos y
 * alguien tiene que envolverlos — eso es esto.
 *
 * Escribe lo mínimo que reproduce bien: cabecera EBML, Info, Tracks y Clusters
 * con un SimpleBlock por cuadro. Sin Cues; el archivo se lee de principio a fin.
 */

class Buf {
  private parts: Uint8Array[] = []
  private len = 0

  push(b: Uint8Array) {
    this.parts.push(b)
    this.len += b.length
  }

  get length() {
    return this.len
  }

  concat(): Uint8Array<ArrayBuffer> {
    const out = new Uint8Array(new ArrayBuffer(this.len))
    let o = 0
    for (const p of this.parts) {
      out.set(p, o)
      o += p.length
    }
    return out
  }
}

/** Entero sin signo en la menor cantidad de bytes posible. */
function uint(v: number): Uint8Array {
  if (v === 0) return new Uint8Array([0])
  const bytes: number[] = []
  let n = v
  while (n > 0) {
    bytes.unshift(n & 0xff)
    n = Math.floor(n / 256)
  }
  return new Uint8Array(bytes)
}

/** Float de 64 bits, que es como EBML guarda la duración. */
function float64(v: number): Uint8Array {
  const b = new Uint8Array(8)
  new DataView(b.buffer).setFloat64(0, v, false)
  return b
}

/**
 * Entero de tamaño variable de EBML: los bits altos marcan cuántos bytes
 * ocupa. Se usa tanto para los IDs como para las longitudes.
 */
function vint(v: number): Uint8Array {
  let width = 1
  while (width <= 8 && v >= Math.pow(2, 7 * width) - 1) width++
  const b = new Uint8Array(width)
  let n = v
  for (let i = width - 1; i >= 0; i--) {
    b[i] = n & 0xff
    n = Math.floor(n / 256)
  }
  b[0] |= 1 << (8 - width)
  return b
}

function el(id: number, payload: Uint8Array): Uint8Array {
  const idb = uint(id)
  const len = vint(payload.length)
  const out = new Uint8Array(idb.length + len.length + payload.length)
  out.set(idb, 0)
  out.set(len, idb.length)
  out.set(payload, idb.length + len.length)
  return out
}

function join(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const b = new Buf()
  for (const p of parts) b.push(p)
  return b.concat()
}

const ID = {
  EBML: 0x1a45dfa3,
  EBMLVersion: 0x4286,
  EBMLReadVersion: 0x42f7,
  EBMLMaxIDLength: 0x42f2,
  EBMLMaxSizeLength: 0x42f3,
  DocType: 0x4282,
  DocTypeVersion: 0x4287,
  DocTypeReadVersion: 0x4285,
  Segment: 0x18538067,
  Info: 0x1549a966,
  TimecodeScale: 0x2ad7b1,
  MuxingApp: 0x4d80,
  WritingApp: 0x5741,
  Duration: 0x4489,
  Tracks: 0x1654ae6b,
  TrackEntry: 0xae,
  TrackNumber: 0xd7,
  TrackUID: 0x73c5,
  TrackType: 0x83,
  CodecID: 0x86,
  Video: 0xe0,
  PixelWidth: 0xb0,
  PixelHeight: 0xba,
  Cluster: 0x1f43b675,
  Timecode: 0xe7,
  SimpleBlock: 0xa3,
}

const utf8 = (s: string) => new TextEncoder().encode(s)

export interface WebMFrame {
  data: Uint8Array
  /** Milisegundos desde el inicio. */
  timeMs: number
  key: boolean
}

/**
 * Acumula cuadros y produce el archivo. Se cierra un Cluster cada segundo
 * porque el timecode de un SimpleBlock es un int16 relativo al Cluster: pasado
 * ese rango se desbordaría.
 */
export class WebMWriter {
  private clusters = new Buf()
  private current: Uint8Array[] = []
  private clusterBase = 0
  private lastTime = 0
  private started = false

  constructor(
    private width: number,
    private height: number,
  ) {}

  addFrame(f: WebMFrame) {
    if (!this.started) {
      this.started = true
      this.clusterBase = f.timeMs
    }
    if (f.timeMs - this.clusterBase > 1000 && f.key) {
      this.flushCluster()
      this.clusterBase = f.timeMs
    }

    const rel = f.timeMs - this.clusterBase
    const head = new Uint8Array(4)
    head[0] = 0x81 // pista 1 como vint
    new DataView(head.buffer).setInt16(1, rel, false)
    head[3] = f.key ? 0x80 : 0

    this.current.push(el(ID.SimpleBlock, join(head, f.data)))
    this.lastTime = f.timeMs
  }

  private flushCluster() {
    if (!this.current.length) return
    this.clusters.push(
      el(ID.Cluster, join(el(ID.Timecode, uint(this.clusterBase)), ...this.current)),
    )
    this.current = []
  }

  finish(frameDurationMs: number): Blob {
    this.flushCluster()

    const header = el(
      ID.EBML,
      join(
        el(ID.EBMLVersion, uint(1)),
        el(ID.EBMLReadVersion, uint(1)),
        el(ID.EBMLMaxIDLength, uint(4)),
        el(ID.EBMLMaxSizeLength, uint(8)),
        el(ID.DocType, utf8('webm')),
        el(ID.DocTypeVersion, uint(2)),
        el(ID.DocTypeReadVersion, uint(2)),
      ),
    )

    const info = el(
      ID.Info,
      join(
        el(ID.TimecodeScale, uint(1e6)), // los timecodes van en milisegundos
        el(ID.MuxingApp, utf8('pixelator')),
        el(ID.WritingApp, utf8('pixelator')),
        el(ID.Duration, float64(this.lastTime + frameDurationMs)),
      ),
    )

    const tracks = el(
      ID.Tracks,
      el(
        ID.TrackEntry,
        join(
          el(ID.TrackNumber, uint(1)),
          el(ID.TrackUID, uint(1)),
          el(ID.TrackType, uint(1)), // vídeo
          el(ID.CodecID, utf8('V_VP9')),
          el(ID.Video, join(el(ID.PixelWidth, uint(this.width)), el(ID.PixelHeight, uint(this.height)))),
        ),
      ),
    )

    const segment = el(ID.Segment, join(info, tracks, this.clusters.concat()))
    return new Blob([join(header, segment)], { type: 'video/webm' })
  }
}
