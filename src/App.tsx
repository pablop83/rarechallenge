import { useCallback, useDeferredValue, useEffect, useRef, useState } from 'react'
import { DEFAULTS, ASPECT_LABELS, type Params, type Fit } from './state/params'
import {
  BUILTIN,
  applyPreset,
  exportPresets,
  extractPreset,
  importPresets,
  loadPresets,
  savePresets,
  type Preset,
} from './state/presets'
import { Viewport } from './ui/Viewport'
import { Group, Slider, Select, TextField, Check } from './ui/controls'
import { PALETTES } from './engine/palette'
import { exportOptions, exportPNG } from './engine/exporter'
import { ImageSource } from './engine/source'

const GENERATORS = [
  ['noise', 'Ruido fbm'],
  ['ridged', 'Ruido con crestas'],
  ['distance', 'Campo de distancia'],
  ['flow', 'Campo de flujo'],
  ['voronoi', 'Voronoi'],
] as const

const SYMMETRIES = [
  ['none', 'Ninguna'],
  ['horizontal', 'Horizontal'],
  ['vertical', 'Vertical'],
  ['quadrant', 'Cuadrantes'],
  ['radial', 'Radial'],
  ['kaleidoscope', 'Caleidoscopio'],
] as const

const DISTORTIONS = [
  ['none', 'Ninguna'],
  ['wave', 'Onda'],
  ['swirl', 'Remolino'],
  ['vortex', 'Vórtice'],
  ['curl', 'Curl'],
  ['turbulence', 'Turbulencia'],
] as const

const MASKS = [
  ['none', 'Ninguna'],
  ['circle', 'Círculo'],
  ['rect', 'Rectángulo'],
  ['blob', 'Mancha'],
] as const

const FITS = [
  ['cover', 'Llenar (recorta)'],
  ['contain', 'Encajar (deja papel)'],
] as const

const COLOR_MODES = [
  ['palette', 'Paleta'],
  ['mono', 'Monocromo'],
  ['duo', 'Dos tintas'],
  ['gradientX', 'Degradado X'],
  ['gradientY', 'Degradado Y'],
  ['radial', 'Degradado radial'],
  ['noise', 'Ruido'],
] as const

const PALETTE_OPTS = Object.entries(PALETTES).map(
  ([k, v]) => [k, v.name] as [string, string],
)

export default function App() {
  const [p, setP] = useState<Params>(DEFAULTS)
  const [source, setSource] = useState<ImageSource | null>(null)
  const [exportPx, setExportPx] = useState(4)
  const [transparent, setTransparent] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const presetFileRef = useRef<HTMLInputElement>(null)

  const [saved, setSaved] = useState<Preset[]>(() => loadPresets())
  const [presetName, setPresetName] = useState('')
  const [withComposition, setWithComposition] = useState(false)
  const [picked, setPicked] = useState('')

  // El campo va por detrás del slider: se arrastra fluido y la composición
  // alcanza cuando el hilo se libera.
  const deferred = useDeferredValue(p)

  const set = useCallback(
    <K extends keyof Params>(k: K) =>
      (v: Params[K]) =>
        setP((prev) => ({ ...prev, [k]: v })),
    [],
  )

  const loadImage = useCallback(async (blob: Blob, name: string) => {
    const next = await ImageSource.fromBlob(blob, name)
    setSource((prev) => {
      prev?.dispose()
      return next
    })
  }, [])

  // Pegar desde el portapapeles.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find((i) =>
        i.type.startsWith('image/'),
      )
      const blob = item?.getAsFile()
      if (blob) loadImage(blob, blob.name || 'portapapeles')
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [loadImage])

  const clearImage = () => {
    source?.dispose()
    setSource(null)
  }

  const reseed = () =>
    setP((prev) => ({ ...prev, seed: Math.random().toString(36).slice(2, 8) }))

  // --- presets ---
  const all = [...BUILTIN, ...saved]

  const persist = (list: Preset[]) => {
    setSaved(list)
    savePresets(list)
  }

  const pick = (key: string) => {
    setPicked(key)
    const preset = all.find((x) => x.name === key)
    if (preset) setP((prev) => applyPreset(prev, preset))
  }

  const storePreset = () => {
    const name = presetName.trim()
    if (!name) return
    const next: Preset = { name, params: extractPreset(p, withComposition) }
    persist([...saved.filter((x) => x.name !== name), next])
    setPresetName('')
    setPicked(name)
  }

  const removePreset = () => {
    persist(saved.filter((x) => x.name !== picked))
    setPicked('')
  }

  const doImport = async (file: File) => {
    const incoming = await importPresets(file)
    const names = new Set(incoming.map((x) => x.name))
    persist([...saved.filter((x) => !names.has(x.name)), ...incoming])
  }

  const isSaved = saved.some((x) => x.name === picked)

  const opts = exportOptions(p, source)

  const doExport = async () => {
    setBusy(true)
    try {
      await exportPNG(p, source, exportPx, transparent)
    } finally {
      setBusy(false)
    }
  }

  const isDuo = p.colorMode === 'mono' || p.colorMode === 'duo'

  return (
    <div className="app">
      <Viewport
        params={deferred}
        source={source}
        onDrop={(f) => loadImage(f, f.name)}
      />

      <aside className="panel">
        <header>
          <h1>Pixelator</h1>
          <p>Composiciones generativas sobre cuatro módulos de 3×3.</p>
        </header>

        <Group title="Imagen">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) loadImage(f, f.name)
              e.target.value = ''
            }}
          />
          <div className="row">
            <button onClick={() => fileRef.current?.click()}>
              {source ? 'Cambiar' : 'Cargar imagen'}
            </button>
            {source && <button onClick={clearImage}>Quitar</button>}
          </div>
          {source && (
            <>
              <p className="note">
                {source.width}×{source.height} · la imagen no sale de tu máquina
              </p>
              <Slider label="Influencia" value={p.imageAmount} min={0} max={1} onChange={set('imageAmount')} />
              <Slider label="Tono → bordes" value={p.imageEdges} min={0} max={1} onChange={set('imageEdges')} />
              <Slider label="Brillo" value={p.imageBrightness} min={-0.5} max={0.5} onChange={set('imageBrightness')} />
              <Slider label="Contraste" value={p.imageContrast} min={0.2} max={4} step={0.05} onChange={set('imageContrast')} />
              <Check label="Invertir" value={p.imageInvert} onChange={set('imageInvert')} />
              <Slider label="Color de la foto" value={p.imageColorAmount} min={0} max={1} onChange={set('imageColorAmount')} />
              <Slider label="Real → paleta" value={p.imageColorQuantize} min={0} max={1} onChange={set('imageColorQuantize')} />
            </>
          )}
        </Group>

        <Group title="Presets">
          <input
            ref={presetFileRef}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) doImport(f)
              e.target.value = ''
            }}
          />
          <label className="ctrl">
            <span className="ctrl-label">Aplicar</span>
            <select value={picked} onChange={(e) => pick(e.target.value)}>
              <option value="">—</option>
              <optgroup label="De fábrica">
                {BUILTIN.map((x) => (
                  <option key={x.name} value={x.name}>
                    {x.name}
                  </option>
                ))}
              </optgroup>
              {saved.length > 0 && (
                <optgroup label="Tuyos">
                  {saved.map((x) => (
                    <option key={x.name} value={x.name}>
                      {x.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>

          <TextField
            label="Guardar como"
            value={presetName}
            onChange={setPresetName}
            after={
              <button className="mini" onClick={storePreset} disabled={!presetName.trim()}>
                ✓
              </button>
            }
          />
          <Check
            label="Incluir semilla y formato"
            value={withComposition}
            onChange={setWithComposition}
          />
          <div className="row">
            <button onClick={() => presetFileRef.current?.click()}>Importar</button>
            <button onClick={() => exportPresets(saved)} disabled={saved.length === 0}>
              Exportar
            </button>
            {isSaved && <button onClick={removePreset}>Borrar</button>}
          </div>
          <p className="note">Un preset guarda parámetros, no la imagen.</p>
        </Group>

        <Group title="Lienzo">
          <TextField
            label="Seed"
            value={p.seed}
            onChange={set('seed')}
            after={
              <button className="mini" onClick={reseed}>
                ↻
              </button>
            }
          />
          <Slider
            label="Grilla (lado mayor)"
            value={p.grid}
            min={20}
            max={320}
            step={4}
            onChange={set('grid')}
          />
          <Select label="Proporción" value={p.aspect} options={ASPECT_LABELS} onChange={set('aspect')} />
          {source && p.aspect !== 'auto' && (
            <Select
              label="Encaje de la foto"
              value={p.fit}
              options={FITS}
              onChange={set('fit') as (v: Fit) => void}
            />
          )}
        </Group>

        <Group title="Campo">
          <Select label="Generador" value={p.generator} options={GENERATORS} onChange={set('generator')} />
          <Slider label="Escala" value={p.fieldScale} min={0.5} max={16} step={0.1} onChange={set('fieldScale')} />
          <Slider label="Octavas" value={p.octaves} min={1} max={7} step={1} onChange={set('octaves')} />
          {(p.generator === 'distance' || p.generator === 'voronoi') && (
            <Slider label="Atractores" value={p.attractors} min={1} max={12} step={1} onChange={set('attractors')} />
          )}
        </Group>

        <Group title="Densidad">
          <Slider label="Densidad" value={p.density} min={0} max={1} onChange={set('density')} />
          <Slider label="Contraste" value={p.contrast} min={0.2} max={5} step={0.05} onChange={set('contrast')} />
          <Slider label="Dureza" value={p.hardness} min={0} max={1} onChange={set('hardness')} />
          <Slider label="Trama → ruido" value={p.randomness} min={0} max={1} onChange={set('randomness')} />
          <Slider label="Coherencia" value={p.coherence} min={0} max={1} onChange={set('coherence')} />
        </Group>

        <Group title="Escala de módulo">
          <Slider
            label="Mínima"
            value={p.minScale}
            min={1}
            max={4}
            step={1}
            onChange={(v) =>
              setP((prev) => ({ ...prev, minScale: v, maxScale: Math.max(prev.maxScale, v) }))
            }
          />
          <Slider
            label="Máxima"
            value={p.maxScale}
            min={1}
            max={4}
            step={1}
            onChange={(v) =>
              setP((prev) => ({ ...prev, maxScale: v, minScale: Math.min(prev.minScale, v) }))
            }
          />
          {p.minScale > 1 && (
            <p className="note">
              Unidad {p.minScale}×{p.minScale}. Las escalas mayores son múltiplos suyos.
            </p>
          )}
          <Slider label="Cantidad" value={p.scaleAmount} min={0} max={1} onChange={set('scaleAmount')} />
          <Slider label="Exige planicie" value={p.scaleFlatness} min={0} max={1} onChange={set('scaleFlatness')} />
        </Group>

        <Group title="Geometría">
          <Select label="Simetría" value={p.symmetry} options={SYMMETRIES} onChange={set('symmetry')} />
          <Select label="Distorsión" value={p.distortion} options={DISTORTIONS} onChange={set('distortion')} />
          {p.distortion !== 'none' && (
            <Slider label="Fuerza" value={p.distortStrength} min={0} max={1} onChange={set('distortStrength')} />
          )}
          <Select label="Máscara" value={p.mask} options={MASKS} onChange={set('mask')} />
          {p.mask !== 'none' && (
            <>
              <Slider label="Tamaño" value={p.maskSize} min={0.1} max={1.4} onChange={set('maskSize')} />
              <Slider label="Difuminado" value={p.maskFeather} min={0.01} max={0.6} onChange={set('maskFeather')} />
            </>
          )}
        </Group>

        <Group title="Color">
          <Select label="Modo" value={p.colorMode} options={COLOR_MODES} onChange={set('colorMode')} />
          {isDuo ? (
            <div className="row">
              <label className="swatch">
                Tinta
                <input type="color" value={p.ink} onChange={(e) => set('ink')(e.target.value)} />
              </label>
              <label className="swatch">
                Papel
                <input type="color" value={p.paper} onChange={(e) => set('paper')(e.target.value)} />
              </label>
            </div>
          ) : (
            <>
              <Select label="Paleta" value={p.palette} options={PALETTE_OPTS} onChange={set('palette')} />
              <Slider label="Escala de color" value={p.colorScale} min={0.5} max={16} step={0.1} onChange={set('colorScale')} />
              <Slider label="Agrupamiento" value={p.colorClustering} min={0} max={1} onChange={set('colorClustering')} />
            </>
          )}
        </Group>

        <Group title="Export">
          <label className="ctrl">
            <span className="ctrl-label">Resolución</span>
            <select value={exportPx} onChange={(e) => setExportPx(parseInt(e.target.value))}>
              {opts.map((o) => (
                <option key={o.px} value={o.px}>
                  {o.w} × {o.h} px
                </option>
              ))}
            </select>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={transparent}
              onChange={(e) => setTransparent(e.target.checked)}
            />
            Fondo transparente
          </label>
          <button className="primary" onClick={doExport} disabled={busy}>
            {busy ? 'Generando…' : 'Exportar PNG'}
          </button>
        </Group>
      </aside>
    </div>
  )
}
