import { crc32, deflateSync } from "node:zlib";

/**
 * Draws icon.svg without an image library. The SVG is limited to filled `<rect>` elements (x, y, width, height, rx,
 * fill as #rrggbb), drawn in order; that is all the placeholder needs. Edges are anti-aliased by supersampling.
 */
export type Rect = { x: number; y: number; width: number; height: number; rx: number; color: [number, number, number] };

const attr = (tag: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];

const channel = (hex: string, at: number) => Number.parseInt(hex.slice(at, at + 2), 16);

export function parseSvg(svg: string): { size: number; rects: Rect[] } {
  const size = Number(/viewBox="0 0 (\d+) \1"/.exec(svg)?.[1]);
  if (!size) throw new Error("icon.svg needs a square viewBox starting at 0 0");
  const rects = [...svg.matchAll(/<rect\b[^>]*>/g)].map(([tag]): Rect => {
    const fill = attr(tag, "fill") ?? "";
    if (!/^#[0-9a-f]{6}$/i.test(fill)) throw new Error(`rect fill must be #rrggbb, got "${fill}"`);
    return {
      x: Number(attr(tag, "x") ?? 0),
      y: Number(attr(tag, "y") ?? 0),
      width: Number(attr(tag, "width")),
      height: Number(attr(tag, "height")),
      rx: Number(attr(tag, "rx") ?? 0),
      color: [channel(fill, 1), channel(fill, 3), channel(fill, 5)],
    };
  });
  return { size, rects };
}

function covers(r: Rect, px: number, py: number): boolean {
  if (px < r.x || py < r.y || px >= r.x + r.width || py >= r.y + r.height) return false;
  const rx = Math.min(r.rx, r.width / 2, r.height / 2);
  const cx = Math.min(Math.max(px, r.x + rx), r.x + r.width - rx);
  const cy = Math.min(Math.max(py, r.y + rx), r.y + r.height - rx);
  return (px - cx) ** 2 + (py - cy) ** 2 <= rx * rx;
}

const SAMPLES = 4;

/** RGBA pixels (straight alpha) of the icon at `px` by `px`. */
export function renderRgba(svg: string, px: number): Buffer {
  const { size, rects } = parseSvg(svg);
  const scale = size / px;
  const out = Buffer.alloc(px * px * 4);
  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let hits = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const ux = (x + (sx + 0.5) / SAMPLES) * scale;
          const uy = (y + (sy + 0.5) / SAMPLES) * scale;
          const top = rects.findLast((rect) => covers(rect, ux, uy));
          if (!top) continue;
          hits++;
          r += top.color[0];
          g += top.color[1];
          b += top.color[2];
        }
      }
      const i = (y * px + x) * 4;
      if (hits) {
        out[i] = Math.round(r / hits);
        out[i + 1] = Math.round(g / hits);
        out[i + 2] = Math.round(b / hits);
      }
      out[i + 3] = Math.round((hits / (SAMPLES * SAMPLES)) * 255);
    }
  }
  return out;
}

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length);
  head.write(type, 4, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])));
  return Buffer.concat([head, data, crc]);
}

export function encodePng(rgba: Buffer, px: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(px, 0);
  ihdr.writeUInt32BE(px, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA, no interlace
  const rows = Buffer.alloc(px * (px * 4 + 1));
  for (let y = 0; y < px; y++) rgba.copy(rows, y * (px * 4 + 1) + 1, y * px * 4, (y + 1) * px * 4); // filter 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(rows, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export const renderPng = (svg: string, px: number) => encodePng(renderRgba(svg, px), px);

/** Windows icon: PNG-compressed entries (supported since Vista). A size of 256 is stored as 0, as the format asks. */
export function encodeIco(pngs: { px: number; png: Buffer }[]): Buffer {
  const head = Buffer.alloc(6 + pngs.length * 16);
  head.writeUInt16LE(1, 2); // type: icon
  head.writeUInt16LE(pngs.length, 4);
  let offset = head.length;
  pngs.forEach(({ px, png }, i) => {
    const e = 6 + i * 16;
    head[e] = px >= 256 ? 0 : px;
    head[e + 1] = px >= 256 ? 0 : px;
    head.writeUInt16LE(1, e + 4); // colour planes
    head.writeUInt16LE(32, e + 6); // bits per pixel
    head.writeUInt32LE(png.length, e + 8);
    head.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  return Buffer.concat([head, ...pngs.map((p) => p.png)]);
}

/** macOS icon: PNG-compressed entries, which macOS 10.7 and later read. */
export function encodeIcns(entries: { type: string; png: Buffer }[]): Buffer {
  const body = entries.map(({ type, png }) => {
    const h = Buffer.alloc(8);
    h.write(type, 0, "latin1");
    h.writeUInt32BE(png.length + 8, 4);
    return Buffer.concat([h, png]);
  });
  const total = 8 + body.reduce((n, b) => n + b.length, 0);
  const h = Buffer.alloc(8);
  h.write("icns", 0, "latin1");
  h.writeUInt32BE(total, 4);
  return Buffer.concat([h, ...body]);
}

export const ICO_SIZES = [16, 32, 48, 256];
/** icns types for 128, 256 and 512 px PNGs. */
export const ICNS_TYPES = [
  { type: "ic07", px: 128 },
  { type: "ic08", px: 256 },
  { type: "ic09", px: 512 },
];

/** Every file the app ships, by name, built from the SVG. */
export function buildIcons(svg: string): Record<"icon.png" | "icon.ico" | "icon.icns", Buffer> {
  const cache = new Map<number, Buffer>();
  const png = (px: number) => {
    const hit = cache.get(px) ?? renderPng(svg, px);
    cache.set(px, hit);
    return hit;
  };
  return {
    "icon.png": png(512),
    "icon.ico": encodeIco(ICO_SIZES.map((px) => ({ px, png: png(px) }))),
    "icon.icns": encodeIcns(ICNS_TYPES.map(({ type, px }) => ({ type, png: png(px) }))),
  };
}
