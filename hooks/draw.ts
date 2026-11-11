export type Tool = 'pen' | 'eraser' | 'fill' | 'line' | 'rect' | 'oval'

export type Sketch = {
  pixels: string[]
  color: string
  tool: Tool
  size: number
  filled: boolean
  start: number[] | null
}

export const sketchGrid = 16
export const blank = '#ffffff'
export const minSize = 1
export const maxSize = 4
export const palette = [
  '#000000',
  '#495057',
  '#868e96',
  '#ced4da',
  '#ffffff',
  '#5c3a21',
  '#7b4a2b',
  '#c68642',
  '#ffc9a0',
  '#e03131',
  '#ff8787',
  '#e64980',
  '#f08c00',
  '#fcc419',
  '#ffec99',
  '#2f9e44',
  '#8ce99a',
  '#087f5b',
  '#1971c2',
  '#74c0fc',
  '#1b2a5c',
  '#9c36b5',
  '#d0bfff',
  '#5f3dc4',
]
export const tools: { tool: Tool; label: string }[] = [
  { tool: 'pen', label: 'Pen' },
  { tool: 'eraser', label: 'Eraser' },
  { tool: 'fill', label: 'Fill' },
  { tool: 'line', label: 'Line' },
  { tool: 'rect', label: 'Rect' },
  { tool: 'oval', label: 'Oval' },
]

export const newSketch = (): Sketch => ({
  pixels: Array<string>(sketchGrid * sketchGrid).fill(blank),
  color: palette[0],
  tool: 'pen',
  size: 1,
  filled: false,
  start: null,
})

const line = (from: number[], to: number[]): number[][] => {
  const steps = Math.max(Math.abs(to[0] - from[0]), Math.abs(to[1] - from[1]))
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = steps === 0 ? 0 : i / steps
    return [
      Math.round(from[0] + (to[0] - from[0]) * t),
      Math.round(from[1] + (to[1] - from[1]) * t),
    ]
  })
}

const bounds = (a: number[], b: number[]) => ({
  x0: Math.min(a[0], b[0]),
  x1: Math.max(a[0], b[0]),
  y0: Math.min(a[1], b[1]),
  y1: Math.max(a[1], b[1]),
})

const rectPoints = (a: number[], b: number[], filled: boolean): number[][] => {
  const { x0, x1, y0, y1 } = bounds(a, b)
  if (!filled) {
    return [
      ...line([x0, y0], [x1, y0]),
      ...line([x1, y0], [x1, y1]),
      ...line([x1, y1], [x0, y1]),
      ...line([x0, y1], [x0, y0]),
    ]
  }
  const points: number[][] = []
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) points.push([x, y])
  }
  return points
}

const ovalPoints = (a: number[], b: number[], filled: boolean): number[][] => {
  const { x0, x1, y0, y1 } = bounds(a, b)
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  const rx = (x1 - x0) / 2
  const ry = (y1 - y0) / 2

  if (filled) {
    const points: number[][] = []
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = rx === 0 ? 0 : (x - cx) / rx
        const dy = ry === 0 ? 0 : (y - cy) / ry
        if (dx * dx + dy * dy <= 1) points.push([x, y])
      }
    }
    return points
  }

  const samples = Math.max(16, Math.ceil(4 * Math.PI * Math.max(rx, ry)))
  const ring = Array.from({ length: samples + 1 }, (_, i) => {
    const angle = (2 * Math.PI * i) / samples
    return [
      Math.round(cx + rx * Math.cos(angle)),
      Math.round(cy + ry * Math.sin(angle)),
    ]
  })
  return ring.flatMap((p, i) => (i === 0 ? [p] : line(ring[i - 1], p)))
}

const floodFill = (pixels: string[], x: number, y: number, color: string) => {
  const target = pixels[y * sketchGrid + x]
  if (target === color) return
  const stack = [[x, y]]
  while (stack.length) {
    const [px, py] = stack.pop()!
    if (px < 0 || py < 0 || px >= sketchGrid || py >= sketchGrid) continue
    if (pixels[py * sketchGrid + px] !== target) continue
    pixels[py * sketchGrid + px] = color
    stack.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1])
  }
}

const stamp = (pixels: string[], x: number, y: number, size: number, ink: string) => {
  const x0 = x - Math.floor((size - 1) / 2)
  const y0 = y - Math.floor((size - 1) / 2)
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      const px = x0 + dx
      const py = y0 + dy
      if (px < 0 || py < 0 || px >= sketchGrid || py >= sketchGrid) continue
      pixels[py * sketchGrid + px] = ink
    }
  }
}

// One click on cell (x, y). Shapes take two clicks: the first sets a corner.
export const paint = (sketch: Sketch, x: number, y: number): Sketch => {
  const ink = sketch.tool === 'eraser' ? blank : sketch.color
  const pixels = [...sketch.pixels]

  if (sketch.tool === 'fill') {
    floodFill(pixels, x, y, ink)
    return { ...sketch, pixels }
  }

  if (sketch.tool === 'pen' || sketch.tool === 'eraser') {
    stamp(pixels, x, y, sketch.size, ink)
    return { ...sketch, pixels }
  }

  if (!sketch.start) return { ...sketch, start: [x, y] }

  const from = sketch.start
  const to = [x, y]
  const points =
    sketch.tool === 'line'
      ? line(from, to)
      : sketch.tool === 'rect'
        ? rectPoints(from, to, sketch.filled)
        : ovalPoints(from, to, sketch.filled)
  for (const [px, py] of points) stamp(pixels, px, py, sketch.size, ink)
  return { ...sketch, pixels, start: null }
}

export const paletteNames = [
  'Black', 'Charcoal', 'Gray', 'Silver', 'White', 'Dark brown', 'Brown', 'Tan',
  'Peach', 'Red', 'Pink', 'Rose', 'Orange', 'Gold', 'Cream', 'Green', 'Mint',
  'Teal', 'Blue', 'Sky', 'Navy', 'Purple', 'Lavender', 'Indigo',
]

export const svgCell = 20
export const svgMargin = 24

// The drawing as SVG: column letters across the top, row numbers down the left.
export const sketchSvg = (sketch: Sketch): string => {
  const size = sketchGrid * svgCell + svgMargin
  const cells = sketch.pixels
    .map((c, i) => {
      const x = svgMargin + (i % sketchGrid) * svgCell
      const y = svgMargin + Math.floor(i / sketchGrid) * svgCell
      return `<rect x="${x}" y="${y}" width="${svgCell}" height="${svgCell}" fill="${c}" stroke="#adb5bd" stroke-width="0.5"/>`
    })
    .join('')
  const text = 'font-family="sans-serif" font-size="11" fill="#868e96" text-anchor="middle"'
  const cols = Array.from(
    { length: sketchGrid },
    (_, i) =>
      `<text x="${svgMargin + i * svgCell + svgCell / 2}" y="16" ${text}>${String.fromCharCode(65 + i)}</text>`,
  ).join('')
  const rows = Array.from(
    { length: sketchGrid },
    (_, i) =>
      `<text x="12" y="${svgMargin + i * svgCell + svgCell / 2 + 4}" ${text}>${i + 1}</text>`,
  ).join('')
  const mark = sketch.start
    ? `<rect x="${svgMargin + sketch.start[0] * svgCell}" y="${svgMargin + sketch.start[1] * svgCell}" width="${svgCell}" height="${svgCell}" fill="none" stroke="#e03131" stroke-width="2"/>`
    : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${cols}${rows}${cells}${mark}</svg>`
}

const emojiSquares: { glyph: string; rgb: number[] }[] = [
  { glyph: '\u2B1B', rgb: [0, 0, 0] },
  { glyph: '\u2B1C', rgb: [255, 255, 255] },
  { glyph: '\u{1F7E5}', rgb: [224, 49, 49] },
  { glyph: '\u{1F7E7}', rgb: [240, 140, 0] },
  { glyph: '\u{1F7E8}', rgb: [252, 196, 25] },
  { glyph: '\u{1F7E9}', rgb: [47, 158, 68] },
  { glyph: '\u{1F7E6}', rgb: [25, 113, 194] },
  { glyph: '\u{1F7EA}', rgb: [156, 54, 181] },
  { glyph: '\u{1F7EB}', rgb: [123, 74, 43] },
]

// The colored square emoji closest to a hex color; emoji keep their color on
// a Button where plain styling does not.
export const nearestEmoji = (hex: string): string => {
  const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
  let best = emojiSquares[0]
  let bestDistance = Infinity
  for (const sq of emojiSquares) {
    const distance = sq.rgb.reduce((sum, v, i) => sum + (v - rgb[i]) ** 2, 0)
    if (distance < bestDistance) {
      best = sq
      bestDistance = distance
    }
  }
  return best.glyph
}
