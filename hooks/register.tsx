import type { Register } from 'claude-code'

import { encodePng } from './png'

const paneId = 'pixel-pad'
const pngScale = 12
const outDir = '.pixel-pad'
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
    const { Client } = $.ui.resolve(e)

    return <Client key="canvas" module="./canvas.tsx" width="100%" height="100%" />
  })

  // The canvas posts its pixels after each stroke; keep the PNG current.
  on('ui.message', { element: 'canvas' }, async ($, e, next) => {
    const pixels = toPixels(e.data)
    if (!pixels) return next(e)

    try {
      const path = `${cwd}/${outDir}/art.png`
      const png = encodePng(pixels, Math.sqrt(pixels.length), pngScale)
      await $.fs.write(`${path}.b64`, png.toBase64())
      const { exitCode, stderr } = await $.process.run([
        'sh',
        '-c',
        `base64 -d < "${path}.b64" > "${path}" && rm "${path}.b64"`,
      ])
      if (exitCode !== 0) throw new Error(stderr)
      savedPath = path
    } catch (error) {
      $.ui.toast(`pixel-pad: could not save PNG: ${String(error)}`)
    }

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
