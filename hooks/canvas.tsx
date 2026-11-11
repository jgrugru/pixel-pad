import type { ClientModule } from 'claude-code'

type Tool = 'pen' | 'eraser' | 'fill' | 'line' | 'rect' | 'oval'
type Canvas = {
  pixels: string[]
  grid: number
  color: string
  tool: Tool
  size: number
  filled: boolean
  last: number[] | null
  start: number[] | null
  base: string[] | null
}
type Button = {
  label: (c: Canvas) => string
  run: (c: Canvas) => void
  isActive?: (c: Canvas) => boolean
  isDanger?: boolean
  isInert?: boolean
}

// Each terminal cell holds two vertical pixels (a half block), so the grid is
// grid columns wide and grid / 2 rows tall. The grid fills the pane and is
// resampled when the pane is resized.
const defaultGrid = 32
const minGrid = 16
const maxGrid = 96
const blank = '#ffffff'
const minSize = 1
const maxSize = 8
const palette = [
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
const paletteRow = 0
const toolsTop = 1
const optionsTop = 2
const gridTop = 3
const activeBg = '#4c6ef5'
const idleBorder = '#868e96'
const dangerBorder = '#e03131'

const toolButton = (tool: Tool, label: string): Button => ({
  label: () => label,
  run: c => {
    c.tool = tool
  },
  isActive: c => c.tool === tool,
})

const toolButtons: Button[] = [
  toolButton('pen', 'Pen'),
  toolButton('eraser', 'Eraser'),
  toolButton('fill', 'Fill'),
  toolButton('line', 'Line'),
  toolButton('rect', 'Rect'),
  toolButton('oval', 'Oval'),
]

const optionButtons: Button[] = [
  {
    label: () => '-',
    run: c => {
      c.size = Math.max(minSize, c.size - 1)
    },
  },
  { label: c => `Size ${c.size}`, run: () => {}, isInert: true },
  {
    label: () => '+',
    run: c => {
      c.size = Math.min(maxSize, c.size + 1)
    },
  },
  {
    label: c => (c.filled ? 'Solid' : 'Outline'),
    run: c => {
      c.filled = !c.filled
    },
  },
  {
    label: () => 'Clear',
    isDanger: true,
    run: c => {
      c.pixels = Array<string>(c.grid * c.grid).fill(blank)
    },
  },
]

const newCanvas = (): Canvas => ({
  pixels: Array<string>(defaultGrid * defaultGrid).fill(blank),
  grid: defaultGrid,
  color: palette[0],
  tool: 'pen',
  size: 2,
  filled: false,
  last: null,
  start: null,
  base: null,
})

// Buttons are laid out left to right with one blank column between them.
const place = (buttons: Button[]) => {
  const sample = newCanvas()
  let x = 0
  return buttons.map(button => {
    // two more columns for the brackets
    const width = button.label(sample).length + 2
    const placed = { button, x, width }
    x += width + 1
    return placed
  })
}

const toolSlots = place(toolButtons)
const optionSlots = place(optionButtons)

// Pixels between two grid points, so a fast drag leaves no gaps.
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

// The biggest even square grid that fits the region under the toolbar.
const fitGrid = (columns: number, rows: number): number => {
  if (columns <= 0 || rows <= 0) return defaultGrid
  const fit = Math.min(columns, 2 * (rows - gridTop))
  return Math.max(minGrid, Math.min(maxGrid, fit - (fit % 2)))
}

// Nearest-neighbor copy of a square grid at a new size.
const resample = (pixels: string[], from: number, to: number): string[] =>
  Array.from({ length: to * to }, (_, i) => {
    const x = Math.floor(((i % to) * from) / to)
    const y = Math.floor((Math.floor(i / to) * from) / to)
    return pixels[y * from + x]
  })

const floodFill = (
  pixels: string[],
  gridSize: number,
  x: number,
  y: number,
  color: string,
) => {
  if (x < 0 || y < 0 || x >= gridSize || y >= gridSize) return
  const target = pixels[y * gridSize + x]
  if (target === color) return
  const stack = [[x, y]]
  while (stack.length) {
    const [px, py] = stack.pop()!
    if (px < 0 || py < 0 || px >= gridSize || py >= gridSize) continue
    if (pixels[py * gridSize + px] !== target) continue
    pixels[py * gridSize + px] = color
    stack.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1])
  }
}

const Pixels: ClientModule<null, Canvas> = (_props, surface) => {
  const { Box, Text } = surface.elements
  const canvas = surface.state

  if (!canvas) {
    const fresh = newCanvas()
    surface.setState(fresh)
    surface.onPointer(e => {
      // A terminal that reports sub-cell positions gives half-cell precision;
      // otherwise a whole cell (both of its pixels) is painted.
      const hasFine = e.fine !== undefined
      const py = hasFine
        ? Math.floor((e.fine!.y - gridTop) * 2)
        : (e.y - gridTop) * 2
      const point = [e.x, py]
      const ink = () => (fresh.tool === 'eraser' ? blank : fresh.color)

      // A square brush of the chosen size, centered on the point.
      const stamp = (x: number, y: number) => {
        const w = fresh.size
        const h = hasFine ? w : w + (w % 2)
        const x0 = x - Math.floor((w - 1) / 2)
        const y0 = hasFine ? y - Math.floor((h - 1) / 2) : y
        for (let dy = 0; dy < h; dy++) {
          for (let dx = 0; dx < w; dx++) {
            const px = x0 + dx
            const qy = y0 + dy
            if (px < 0 || qy < 0 || px >= fresh.grid || qy >= fresh.grid) continue
            fresh.pixels[qy * fresh.grid + px] = ink()
          }
        }
      }

      const strokeTo = (from: number[]) => {
        for (const [x, y] of line(from, point)) stamp(x, y)
        fresh.last = point
      }

      // Shapes are redrawn from the snapshot taken at mouse-down.
      const shapeTo = (from: number[]) => {
        fresh.pixels = [...fresh.base!]
        const points =
          fresh.tool === 'line'
            ? line(from, point)
            : fresh.tool === 'rect'
              ? rectPoints(from, point, fresh.filled)
              : ovalPoints(from, point, fresh.filled)
        for (const [x, y] of points) stamp(x, y)
      }

      const isShape = ['line', 'rect', 'oval'].includes(fresh.tool)

      if (e.type === 'down' && e.button === 'left') {
        if (e.y === paletteRow) {
          const picked = palette[Math.floor(e.x / 2)]
          if (picked) {
            fresh.color = picked
            if (fresh.tool === 'eraser') fresh.tool = 'pen'
          }
        } else if (e.y >= toolsTop && e.y < gridTop) {
          const slots = e.y < optionsTop ? toolSlots : optionSlots
          const hit = slots.find(s => e.x >= s.x && e.x < s.x + s.width)
          if (hit) {
            hit.button.run(fresh)
            surface.post({ pixels: fresh.pixels })
          }
        } else if (e.y >= gridTop && e.y < gridTop + fresh.grid / 2) {
          if (fresh.tool === 'fill') {
            floodFill(fresh.pixels, fresh.grid, e.x, py, ink())
            if (!hasFine) floodFill(fresh.pixels, fresh.grid, e.x, py + 1, ink())
          } else if (isShape) {
            fresh.base = [...fresh.pixels]
            fresh.start = point
            shapeTo(point)
          } else {
            fresh.last = point
            strokeTo(point)
          }
        }
      } else if (e.type === 'move' && e.button === 'left') {
        if (fresh.start && fresh.base) shapeTo(fresh.start)
        else if (fresh.last) strokeTo(fresh.last)
      } else if (e.type === 'up') {
        fresh.last = null
        fresh.start = null
        fresh.base = null
        surface.post({ pixels: fresh.pixels })
      }
      surface.setState(fresh)
    })

    return <Text> </Text>
  }

  const fitted = fitGrid(surface.columns, surface.rows)
  if (fitted !== canvas.grid) {
    canvas.pixels = resample(canvas.pixels, canvas.grid, fitted)
    canvas.grid = fitted
    canvas.last = null
    canvas.start = null
    canvas.base = null
    surface.setState(canvas)
  }
  const gridSize = canvas.grid
  const gridRows = gridSize / 2

  // One row of cells: a run of equal (top, bottom) pairs is one Text.
  const rowRuns = (r: number) => {
    const runs: { top: string; bottom: string; length: number }[] = []
    for (let x = 0; x < gridSize; x++) {
      const top = canvas.pixels[2 * r * gridSize + x]
      const bottom = canvas.pixels[(2 * r + 1) * gridSize + x]
      const last = runs[runs.length - 1]
      if (last && last.top === top && last.bottom === bottom) last.length++
      else runs.push({ top, bottom, length: 1 })
    }
    return runs
  }

  const buttonRow = (slots: ReturnType<typeof place>) => (
    <Box flexDirection="row">
      {slots.map(({ button }) => {
        const isActive = button.isActive?.(canvas) ?? false
        const tone = isActive
          ? activeBg
          : button.isDanger
            ? dangerBorder
            : idleBorder
        return (
          <Box marginRight={1}>
            <Text
              bold={isActive}
              dimColor={button.isInert}
              color={isActive ? '#ffffff' : tone}
              backgroundColor={isActive ? activeBg : undefined}
            >
              {`[${button.label(canvas)}]`}
            </Text>
          </Box>
        )
      })}
    </Box>
  )

  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        {palette.map(c => (
          <Text backgroundColor={c}>
            {c === canvas.color && canvas.tool !== 'eraser' ? '[]' : '  '}
          </Text>
        ))}
      </Box>
      {buttonRow(toolSlots)}
      {buttonRow(optionSlots)}
      {Array.from({ length: gridRows }, (_, r) => (
        <Box flexDirection="row">
          {rowRuns(r).map(run => (
            <Text color={run.top} backgroundColor={run.bottom}>
              {'▀'.repeat(run.length)}
            </Text>
          ))}
        </Box>
      ))}
    </Box>
  )
}

export default Pixels
