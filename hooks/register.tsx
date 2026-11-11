import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import {
  blank,
  maxSize,
  minSize,
  newSketch,
  paint,
  paletteNames,
  palette,
  sketchGrid,
  nearestEmoji,
  tools,
} from './draw'
import type { Sketch, Tool } from './draw'
import { encodePng } from './png'

const paneId = 'pixel-pad'
const pngScale = 12
const outDir = '.pixel-pad'
const sketch = atom({ plugin: 'pixel-pad', key: 'sketch' } as const, newSketch(), {
  shape: 'sketch-1',
})
const hexColor = /^#[0-9a-f]{6}$/

const toPixels = (data: unknown): string[] | undefined => {
  const pixels = (data as { pixels?: unknown } | null)?.pixels
  const size = Math.sqrt(Array.isArray(pixels) ? pixels.length : 0)
  const isValid =
    Array.isArray(pixels) &&
    Number.isInteger(size) &&
    size > 0 &&
    pixels.every(p => typeof p === 'string' && hexColor.test(p))

  return isValid ? pixels : undefined
}

// Writes the drawing as a PNG under cwd and returns its path, or undefined on failure.
const savePng = async (
  $: EngineInterface,
  cwd: string,
  pixels: string[],
): Promise<string | undefined> => {
  try {
    const path = `${cwd}/${outDir}/art.png`
    const tmp = `${path}.${Date.now()}.b64`
    const png = encodePng(pixels, Math.sqrt(pixels.length), pngScale)
    await $.fs.write(tmp, png.toBase64())
    const { exitCode, stderr } = await $.process.run([
      'sh',
      '-c',
      `base64 -d < "${tmp}" > "${path}"; status=$?; rm -f "${tmp}"; exit $status`,
    ])
    if (exitCode !== 0) throw new Error(stderr)
    return path
  } catch (error) {
    $.ui.toast(`pixel-pad: could not save PNG: ${String(error)}`)
    return undefined
  }
}

export const register: Register = on => {
  let cwd = ''
  let savedPath: string | undefined

  on('session.start', async ($, e, next) => {
    cwd = e.cwd
    await $.command.register({
      name: 'pixel-pad',
      description: 'Open the pixel art pane',
    })

    return next(e)
  })

  on('command.run', { command: 'pixel-pad' }, async $ => {
    await $.ui.open({ id: paneId, title: 'Pixel pad', rows: 19, columns: 48 })

    return { text: 'Pixel pad opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: paneId }, async ($, e) => {
    if (e.surface === 'terminal' || e.surface === 'desktop') {
      const { Client } = $.ui.resolve(e)

      return <Client key="canvas" module="./canvas.tsx" width="100%" height="100%" />
    }

    // vscode and mobile have no Client and no pointer: a grid of plain Buttons
    // labeled with colored square emoji, one press paints one cell.
    const { Box, Text, Button, Select } = $.ui.resolve(e)
    const current = await read($, sketch)
    const change = (fn: (s: Sketch) => Sketch) => () => {
      void update($, sketch, fn)
        .then(() => read($, sketch))
        .then(next => savePng($, cwd, next.pixels))
        .then(path => {
          savedPath = path ?? savedPath
        })
    }
    const setState = (fn: (s: Sketch) => Sketch) => () => {
      void update($, sketch, fn)
    }
    return (
      <Box flexDirection="column">
        {current.start && (
          <Text dimColor>
            Corner set at {current.start[0] + 1},{current.start[1] + 1}. Click the opposite corner.
          </Text>
        )}
        {Array.from({ length: sketchGrid }, (_, y) => (
          <Box flexDirection="row" key={`row-${y}`}>
            {Array.from({ length: sketchGrid }, (_, x) => (
              <Button
                key={`px-${x}-${y}`}
                label={nearestEmoji(current.pixels[y * sketchGrid + x])}
                plain
                onPress={change(s => paint(s, x, y))}
              />
            ))}
          </Box>
        ))}
        <Box flexDirection="row" flexWrap="wrap">
          <Select
            key="color"
            label="Color"
            value={current.color}
            options={palette.map((c, i) => ({ value: c, label: `${paletteNames[i]} ${c}` }))}
            onSelect={c =>
              void update($, sketch, s => ({
                ...s,
                color: c,
                tool: s.tool === 'eraser' ? 'pen' : s.tool,
              }))
            }
          />
          <Select
            key="tool"
            label="Tool"
            value={current.tool}
            options={tools.map(t => ({ value: t.tool, label: t.label }))}
            onSelect={t => void update($, sketch, s => ({ ...s, tool: t as Tool, start: null }))}
          />
        </Box>
        <Box flexDirection="row" flexWrap="wrap">
          <Button
            key="size-down"
            label="-"
            onPress={setState(s => ({ ...s, size: Math.max(minSize, s.size - 1) }))}
          />
          <Text> Size {current.size} </Text>
          <Button
            key="size-up"
            label="+"
            onPress={setState(s => ({ ...s, size: Math.min(maxSize, s.size + 1) }))}
          />
          <Button
            key="filled"
            label={current.filled ? 'Solid' : 'Outline'}
            onPress={setState(s => ({ ...s, filled: !s.filled }))}
          />
          <Button
            key="clear"
            label="Clear"
            onPress={change(s => ({
              ...s,
              pixels: Array<string>(sketchGrid * sketchGrid).fill(blank),
              start: null,
            }))}
          />
        </Box>
      </Box>
    )
  })

  // The canvas posts its pixels after each stroke; keep the PNG current.
  on('ui.message', { element: 'canvas' }, async ($, e, next) => {
    const pixels = toPixels(e.data)
    if (!pixels) return next(e)

    savedPath = (await savePng($, cwd, pixels)) ?? savedPath

    return next(e)
  })

  // With the pane open, a typed prompt carries the drawing's path as context.
  on('prompt.submit', async ($, e, next) => {
    const isOpen = await $.ui
      .panes()
      .then(panes => panes.some(pane => pane.id === paneId))
      .catch(() => false)
    if (!isOpen || !savedPath || e.origin.kind === 'plugin') return next(e)

    return next({
      ...e,
      context: [
        ...(e.context ?? []),
        `The user has a pixel art canvas open. Its current drawing is the image ${savedPath}; view it with the Read tool.`,
      ],
    })
  })
}
