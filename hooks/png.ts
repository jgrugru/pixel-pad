const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

const crc32 = (bytes: Uint8Array): number => {
  let c = 0xffffffff
  for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const adler32 = (bytes: Uint8Array): number => {
  let a = 1
  let b = 0
  for (const v of bytes) {
    a = (a + v) % 65521
    b = (b + a) % 65521
  }
  return ((b << 16) | a) >>> 0
}

const u32 = (n: number): number[] => [
  (n >>> 24) & 0xff,
  (n >>> 16) & 0xff,
  (n >>> 8) & 0xff,
  n & 0xff,
]

const chunk = (type: string, data: Uint8Array): number[] => {
  const body = Uint8Array.from([
    ...[...type].map(c => c.charCodeAt(0)),
    ...data,
  ])
  return [...u32(data.length), ...body, ...u32(crc32(body))]
}

// zlib stream of stored (uncompressed) deflate blocks
const zlibStored = (raw: Uint8Array): number[] => {
  const out = [0x78, 0x01]
  for (let i = 0; i < raw.length; i += 65535) {
    const part = raw.subarray(i, i + 65535)
    const isLast = i + 65535 >= raw.length ? 1 : 0
    out.push(isLast, part.length & 0xff, part.length >>> 8)
    out.push(~part.length & 0xff, (~part.length >>> 8) & 0xff, ...part)
  }
  out.push(...u32(adler32(raw)))
  return out
}

const hexToRgb = (hex: string): number[] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
]

// Encodes a size x size grid of '#rrggbb' strings as an RGB PNG, each pixel
// drawn scale x scale so the image is big enough to see.
export const encodePng = (
  pixels: readonly string[],
  size: number,
  scale: number,
): Uint8Array => {
  const width = size * scale
  const raw: number[] = []
  for (let y = 0; y < width; y++) {
    raw.push(0)
    for (let x = 0; x < width; x++) {
      const px = pixels[Math.floor(y / scale) * size + Math.floor(x / scale)]
      raw.push(...hexToRgb(px))
    }
  }
  const header = Uint8Array.from([...u32(width), ...u32(width), 8, 2, 0, 0, 0])

  return Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...chunk('IHDR', header),
    ...chunk('IDAT', Uint8Array.from(zlibStored(Uint8Array.from(raw)))),
    ...chunk('IEND', new Uint8Array()),
  ])
}
