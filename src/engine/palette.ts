/**
 * Color. Los módulos son binarios —tinta o nada— así que colorear es elegir dos
 * colores por celda: el de la tinta y el del fondo. Todo lo demás es decidir de
 * qué campo sale cada uno.
 *
 * Los colores van empaquetados en Uint32 con el orden de bytes de ImageData
 * (R, G, B, A en memoria), para escribirlos de un tiro sin tocar canales.
 */

import type { ColorMode } from '../state/params'
import { clamp } from './rng'

export const packRGBA = (r: number, g: number, b: number, a = 255) =>
  (((a << 24) | (b << 16) | (g << 8) | r) >>> 0)

export const TRANSPARENT = 0

export function hexToPacked(hex: string): number {
  const h = hex.replace('#', '')
  const v = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return packRGBA((v >> 16) & 255, (v >> 8) & 255, v & 255)
}

export interface Palette {
  name: string
  paper: string
  colors: string[]
}

/**
 * Paletas sacadas de las referencias.
 *
 * Ninguna incluye un color parecido a su propio papel: la tinta blanca sobre
 * papel blanco no es un color claro, es una celda perdida. En las referencias
 * las formas blancas no están impresas — son el papel que asoma donde no hay
 * módulo, y de eso ya se encarga el extremo vacío de la rampa de densidad.
 */
const DEFAULT_PALETTES: Record<string, Palette> = {
  iaac: {
    name: 'IAAC 2026',
    paper: '#ffffff',
    colors: ['#f5451c', '#7b4fe0', '#ff4fc3'],
  },
  summer: {
    name: 'IAAC 2024',
    paper: '#ffffff',
    colors: ['#ff00cc', '#00a03c', '#111111'],
  },
  blueprint: {
    name: 'Cianotipo',
    paper: '#0b37d4',
    colors: ['#ffffff', '#c9d8ff'],
  },
  mono: {
    name: 'Monocromo',
    paper: '#ffffff',
    colors: ['#000000'],
  },
  risograph: {
    name: 'Risograph',
    paper: '#f4f1e8',
    colors: ['#ff4a3d', '#2b4bff', '#ffb400', '#111111'],
  },
  plotter: {
    name: 'Plotter',
    paper: '#f7f5f0',
    colors: ['#1a1a1a', '#d63b1f', '#1f5fd6'],
  },
}

const STORAGE_KEY = 'pixelator.palettes.v1'

function clonePalette(p: Palette): Palette {
  return { name: p.name, paper: p.paper, colors: [...p.colors] }
}

function loadStoredPalettes(): Record<string, Palette> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    // Un localStorage corrupto no debería impedir abrir la app.
    return {}
  }
}

/**
 * Paletas en memoria: arrancan de las de fábrica y se les pisan encima las
 * ediciones guardadas del navegador. Se mutan in-place (no se reemplaza el
 * objeto) para que todo el código que ya tiene la referencia —acá y en
 * compose.ts— vea los cambios sin re-importar nada.
 */
export const PALETTES: Record<string, Palette> = {}
for (const [k, v] of Object.entries(DEFAULT_PALETTES)) PALETTES[k] = clonePalette(v)
for (const [k, v] of Object.entries(loadStoredPalettes())) PALETTES[k] = clonePalette(v)

function persistPalettes(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(PALETTES))
  } catch {
    // Privado/cuota llena: la edición sigue funcionando en memoria.
  }
}

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export function isBuiltinPalette(key: string): boolean {
  return key in DEFAULT_PALETTES
}

const cache = new Map<string, Uint32Array>()

export function updatePalette(key: string, patch: Partial<Palette>): void {
  const cur = PALETTES[key] ?? { name: key, paper: '#ffffff', colors: ['#000000'] }
  PALETTES[key] = { ...cur, ...patch }
  cache.delete(key)
  persistPalettes()
}

export function setPaletteColor(key: string, index: number, hex: string): void {
  const cur = PALETTES[key]
  if (!cur) return
  const colors = [...cur.colors]
  colors[index] = hex
  PALETTES[key] = { ...cur, colors }
  cache.delete(key)
  persistPalettes()
}

export function addPaletteColor(key: string, hex = '#888888'): void {
  const cur = PALETTES[key]
  if (!cur) return
  PALETTES[key] = { ...cur, colors: [...cur.colors, hex] }
  cache.delete(key)
  persistPalettes()
}

export function removePaletteColor(key: string, index: number): void {
  const cur = PALETTES[key]
  if (!cur || cur.colors.length <= 1) return
  PALETTES[key] = { ...cur, colors: cur.colors.filter((_, i) => i !== index) }
  cache.delete(key)
  persistPalettes()
}

/** Copia una paleta bajo una clave nueva y devuelve esa clave. */
export function duplicatePalette(sourceKey: string, newName: string): string {
  const src = PALETTES[sourceKey] ?? PALETTES.mono
  const base = slugify(newName) || 'paleta'
  let key = base
  let n = 1
  while (PALETTES[key]) key = `${base}-${++n}`
  PALETTES[key] = { name: newName || key, paper: src.paper, colors: [...src.colors] }
  persistPalettes()
  return key
}

/** Sólo borra paletas que el usuario agregó: las de fábrica se restablecen, no se borran. */
export function deleteCustomPalette(key: string): void {
  if (isBuiltinPalette(key)) return
  delete PALETTES[key]
  cache.delete(key)
  persistPalettes()
}

export function resetPaletteToDefault(key: string): void {
  const def = DEFAULT_PALETTES[key]
  if (!def) return
  PALETTES[key] = clonePalette(def)
  cache.delete(key)
  persistPalettes()
}

export function paletteColors(key: string): Uint32Array {
  const hit = cache.get(key)
  if (hit) return hit
  const p = PALETTES[key] ?? PALETTES.mono
  const arr = new Uint32Array(p.colors.map(hexToPacked))
  cache.set(key, arr)
  return arr
}

/**
 * Interpola dos colores empaquetados. Se hace en espacio de bytes: para dos
 * tintas planas no hace falta más, y evita el coste de pasar por un espacio
 * perceptual en cada celda.
 */
export function lerpPacked(a: number, b: number, t: number): number {
  const u = clamp(t, 0, 1)
  const ar = a & 255
  const ag = (a >> 8) & 255
  const ab = (a >> 16) & 255
  const br = b & 255
  const bg = (b >> 8) & 255
  const bb = (b >> 16) & 255
  return packRGBA(
    (ar + (br - ar) * u) | 0,
    (ag + (bg - ag) * u) | 0,
    (ab + (bb - ab) * u) | 0,
  )
}

/**
 * Color de la paleta más cercano a uno dado. La distancia se pondera con los
 * mismos coeficientes de luminancia que usa el muestreo: en RGB plano un error
 * en azul cuenta igual que uno en verde, y al cuantizar una foto a tres tintas
 * eso manda los medios tonos al color equivocado.
 */
export function nearestInPalette(colors: Uint32Array, c: number): number {
  const r = c & 255
  const g = (c >> 8) & 255
  const b = (c >> 16) & 255
  let best = colors[0]
  let bestD = Infinity
  for (let i = 0; i < colors.length; i++) {
    const p = colors[i]
    const dr = r - (p & 255)
    const dg = g - ((p >> 8) & 255)
    const db = b - ((p >> 16) & 255)
    const d = 0.2126 * dr * dr + 0.7152 * dg * dg + 0.0722 * db * db
    if (d < bestD) {
      bestD = d
      best = p
    }
  }
  return best
}

export interface ColorCtx {
  mode: ColorMode
  colors: Uint32Array
  ink: number
  paper: number
  clustering: number
}

/**
 * Color de tinta para una celda. `t` es una señal continua (posición, campo o
 * ruido según el modo) y `region` un identificador de mancha; `clustering`
 * decide cuánto manda la mancha sobre el degradado — con clustering alto el
 * color queda plano por zonas, que es lo que hace que se lea como impresión a
 * tintas y no como un degradado digital.
 */
export function inkColor(ctx: ColorCtx, t: number, region: number): number {
  const { mode, colors, clustering } = ctx

  if (mode === 'mono' || mode === 'duo') return ctx.ink

  const n = colors.length
  if (n === 0) return ctx.ink
  if (n === 1) return colors[0]

  // Mezcla entre la señal continua y el id de región.
  const blended = t * (1 - clustering) + region * clustering
  const idx = clamp(Math.floor(blended * n), 0, n - 1)

  if (mode === 'palette') return colors[idx]

  // Los modos de degradado recorren la paleta de forma continua.
  const f = clamp(blended, 0, 0.999) * (n - 1)
  const i = Math.floor(f)
  return lerpPacked(colors[i], colors[Math.min(i + 1, n - 1)], f - i)
}
