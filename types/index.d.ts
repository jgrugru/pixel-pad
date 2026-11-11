declare module 'claude-code' {
  interface PluginState {
    'pixel-pad': {
      sketch: Shaped<{
        pixels: string[]
        color: string
        tool: 'pen' | 'eraser' | 'fill' | 'line' | 'rect' | 'oval'
        size: number
        filled: boolean
        start: number[] | null
      }>
    }
  }
}
