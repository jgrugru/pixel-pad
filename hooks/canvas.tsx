import type { ClientModule } from 'claude-code'

type Canvas = { pixels: string[]; color: string; last: number[] | null }

// Each terminal cell holds two vertical pixels (a half block), so the grid is
// gridSize columns wide and gridSize / 2 rows tall.
const gridSize = 48
const blank = '#ffffff'
const palette = [
  '#000000',
  '#ffffff',
  '#e03131',
  '#f08c00',
  '#fcc419',
  '#2f9e44',
  '#1971c2',
  '#9c36b5',
  '#7b4a2b',
]
const gridTop = 2
const gridRows = gridSize / 2
const buttonsRow = gridTop + gridRows + 1

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

const paint = (canvas: Canvas, x: number, y: number) => {
  if (x < 0 || y < 0 || x >= gridSize || y >= gridSize) return
  canvas.pixels[y * gridSize + x] = canvas.color
}

const Pixels: ClientModule<null, Canvas> = (_props, surface) => {
  const { Box, Text } = surface.elements
  const canvas = surface.state

  if (!canvas) {
    const fresh: Canvas = {
      pixels: Array<string>(gridSize * gridSize).fill(blank),
      color: palette[0],
      last: null,
    }
    surface.setState(fresh)
    surface.onPointer(e => {
      // A terminal that reports sub-cell positions gives half-cell precision;
      // otherwise a whole cell (both of its pixels) is painted.
      const hasFine = e.fine !== undefined
      const py = hasFine
        ? Math.floor((e.fine!.y - gridTop) * 2)
        : (e.y - gridTop) * 2
      const point = [e.x, py]
      const strokeTo = (from: number[]) => {
        for (const [x, y] of line(from, point)) {
          paint(fresh, x, y)
          if (!hasFine) paint(fresh, x, y + 1)
        }
        fresh.last = point
      }

      if (e.type === 'down' && e.button === 'left') {
        if (e.y === 0) {
          fresh.color = palette[Math.floor(e.x / 2)] ?? fresh.color
        } else if (e.y === buttonsRow) {
          fresh.pixels.fill(blank)
          surface.post({ pixels: fresh.pixels })
        } else if (e.y >= gridTop && e.y < gridTop + gridRows) {
          strokeTo(point)
        }
      } else if (e.type === 'move' && e.button === 'left' && fresh.last) {
        strokeTo(fresh.last)
      } else if (e.type === 'up') {
        fresh.last = null
        surface.post({ pixels: fresh.pixels })
      }
      surface.setState(fresh)
    })

    return <Text> </Text>
  }

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

  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        {palette.map(c => (
          <Text backgroundColor={c}>{c === canvas.color ? '[]' : '  '}</Text>
        ))}
      </Box>
      <Text> </Text>
      {Array.from({ length: gridRows }, (_, r) => (
        <Box flexDirection="row">
          {rowRuns(r).map(run => (
            <Text color={run.top} backgroundColor={run.bottom}>
              {'▀'.repeat(run.length)}
            </Text>
          ))}
        </Box>
      ))}
      <Text> </Text>
      <Text bold>[ Clear ]</Text>
    </Box>
  )
}

export default Pixels
