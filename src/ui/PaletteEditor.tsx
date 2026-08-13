import { useState } from 'react'
import {
  PALETTES,
  isBuiltinPalette,
  updatePalette,
  setPaletteColor,
  addPaletteColor,
  removePaletteColor,
  duplicatePalette,
  deleteCustomPalette,
  resetPaletteToDefault,
} from '../engine/palette'
import { TextField } from './controls'

/**
 * Edita en el sitio la paleta seleccionada. `PALETTES` se muta directo (no es
 * estado de React), así que cada acción llama a `onChange` para que el padre
 * vuelva a renderizar con los valores frescos y dispare una recomposición.
 */
export function PaletteEditor({
  paletteKey,
  onSelect,
  onChange,
}: {
  paletteKey: string
  onSelect: (key: string) => void
  onChange: () => void
}) {
  const [dupName, setDupName] = useState('')
  const pal = PALETTES[paletteKey] ?? PALETTES.mono
  const builtin = isBuiltinPalette(paletteKey)

  return (
    <div className="palette-editor">
      <TextField
        label="Nombre"
        value={pal.name}
        onChange={(v) => {
          updatePalette(paletteKey, { name: v })
          onChange()
        }}
      />

      <div className="swatch-grid">
        <label className="swatch">
          Papel
          <input
            type="color"
            value={pal.paper}
            onChange={(e) => {
              updatePalette(paletteKey, { paper: e.target.value })
              onChange()
            }}
          />
        </label>

        {pal.colors.map((c, i) => (
          <div className="swatch" key={i}>
            <span className="row swatch-head">
              Tinta {i + 1}
              {pal.colors.length > 1 && (
                <button
                  className="swatch-remove"
                  title="Quitar color"
                  onClick={() => {
                    removePaletteColor(paletteKey, i)
                    onChange()
                  }}
                >
                  ×
                </button>
              )}
            </span>
            <input
              type="color"
              value={c}
              onChange={(e) => {
                setPaletteColor(paletteKey, i, e.target.value)
                onChange()
              }}
            />
          </div>
        ))}
      </div>

      <div className="row">
        <button
          onClick={() => {
            addPaletteColor(paletteKey)
            onChange()
          }}
        >
          + Color
        </button>
        {builtin ? (
          <button
            onClick={() => {
              resetPaletteToDefault(paletteKey)
              onChange()
            }}
          >
            Restablecer
          </button>
        ) : (
          <button
            onClick={() => {
              deleteCustomPalette(paletteKey)
              onSelect('iaac')
              onChange()
            }}
          >
            Borrar paleta
          </button>
        )}
      </div>

      <TextField
        label="Duplicar como"
        value={dupName}
        onChange={setDupName}
        after={
          <button
            className="mini"
            onClick={() => {
              const key = duplicatePalette(paletteKey, dupName.trim() || `${pal.name} copia`)
              setDupName('')
              onSelect(key)
              onChange()
            }}
          >
            ✓
          </button>
        }
      />
    </div>
  )
}

