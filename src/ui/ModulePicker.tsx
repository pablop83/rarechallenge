import {
  MODULE_ORDER,
  MODULE_LABELS,
  MODULE_INK,
  RES,
  moduleCells,
  type ModuleKey,
} from '../engine/modules'

/**
 * Las siluetas del alfabeto, cada una dibujada a su tamaño real de 5×5 y
 * clickeable para activarla. Mostrar la máscara y no un ícono es lo que hace
 * entendible el sistema: se ve que el anillo tiene un hueco y que el checker es
 * media celda, y por eso se entiende por qué caen donde caen en la rampa.
 *
 * El vacío no está: no es una silueta opcional sino el otro extremo de la
 * rampa, el papel que asoma donde no hay módulo.
 */
export function ModulePicker({
  value,
  onChange,
}: {
  value: ModuleKey[]
  onChange: (v: ModuleKey[]) => void
}) {
  const on = Array.isArray(value) ? value : []

  const toggle = (k: ModuleKey) => {
    const next = on.includes(k) ? on.filter((x) => x !== k) : [...on, k]
    // Sin ninguna silueta no habría con qué dibujar; el motor caería al sólido
    // igual, así que es más honesto no dejar apagar la última.
    if (next.length === 0) return
    onChange(MODULE_ORDER.filter((x) => next.includes(x)))
  }

  return (
    <div className="modules">
      {MODULE_ORDER.map((k) => {
        const active = on.includes(k)
        return (
          <button
            key={k}
            className={active ? 'module on' : 'module'}
            aria-pressed={active}
            onClick={() => toggle(k)}
            title={`${MODULE_LABELS[k]} · ${Math.round(MODULE_INK[k] * 100)}% de tinta`}
          >
            <span
              className="module-art"
              style={{ gridTemplateColumns: `repeat(${RES}, 1fr)` }}
              aria-hidden="true"
            >
              {moduleCells(k).map((filled, i) => (
                <i key={i} className={filled ? 'on' : ''} />
              ))}
            </span>
            <span className="module-name">{MODULE_LABELS[k]}</span>
          </button>
        )
      })}
    </div>
  )
}
