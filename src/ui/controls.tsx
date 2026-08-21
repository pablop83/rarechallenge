import { useEffect, useState, type ReactNode } from 'react'

/** Segmentado del inspector. Una sola fila, sin scroll: cuatro como mucho. */
export function Tabs<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: readonly (readonly [T, string])[]
  onChange: (v: T) => void
}) {
  return (
    <div className="tabs" role="tablist">
      {options.map(([v, l]) => (
        <button
          key={v}
          role="tab"
          aria-selected={v === value}
          className={v === value ? 'tab on' : 'tab'}
          onClick={() => onChange(v)}
        >
          {l}
        </button>
      ))}
    </div>
  )
}

/**
 * Sección plegable. El estado abierto/cerrado vive en localStorage y no en
 * React: es preferencia de la persona, no del documento, y sobrevive al reload
 * sin ensuciar los params ni los presets.
 */
export function Section({
  id,
  title,
  defaultOpen = true,
  aside,
  children,
}: {
  id: string
  title: string
  defaultOpen?: boolean
  aside?: ReactNode
  children: ReactNode
}) {
  const key = `pixelator.section.${id}`
  const [open, setOpen] = useState(() => {
    const raw = localStorage.getItem(key)
    return raw === null ? defaultOpen : raw === '1'
  })

  useEffect(() => {
    localStorage.setItem(key, open ? '1' : '0')
  }, [key, open])

  return (
    <section className={open ? 'section open' : 'section'}>
      <button className="section-head" onClick={() => setOpen((o) => !o)}>
        <svg className="chev" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M4.5 2.5 L8 6 L4.5 9.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        <span className="section-title">{title}</span>
        {aside && <span className="section-aside">{aside}</span>}
      </button>
      {open && <div className="section-body">{children}</div>}
    </section>
  )
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 0.01,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
}) {
  return (
    <label className="ctrl">
      <span className="ctrl-label">
        {label}
        <em>{step >= 1 ? value : value.toFixed(2)}</em>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </label>
  )
}

export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: readonly (readonly [T, string])[]
  onChange: (v: T) => void
}) {
  return (
    <label className="ctrl">
      <span className="ctrl-label">{label}</span>
      <div className="select-wrap">
        <select value={value} onChange={(e) => onChange(e.target.value as T)}>
          {options.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <svg className="chev sm" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M3 5 L6 8 L9 5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </div>
    </label>
  )
}

export function Check({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="check">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      <span className="box" aria-hidden="true">
        <svg viewBox="0 0 12 12">
          <path d="M2.5 6.2 L4.8 8.5 L9.5 3.8" fill="none" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      </span>
      {label}
    </label>
  )
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  after,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  after?: ReactNode
}) {
  return (
    <label className="ctrl">
      <span className="ctrl-label">{label}</span>
      <div className="row">
        <input
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
        {after}
      </div>
    </label>
  )
}
