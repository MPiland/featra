/**
 * The Windows taskbar overlay (STORY-67): the count drawn in white on a red disc, as raw pixels, since Windows has no
 * badge of its own to put text in. Drawn in code, so no image files ship for each number. Pure, so tests read its
 * pixels.
 */

/** The overlay's size in pixels: Windows shows a 16 × 16 overlay, drawn here at twice that for high-DPI screens. */
export const BADGE_PX = 32;
export const BADGE_SCALE = 2;

/** The disc's red (Windows' own critical red) and the digits' white, as RGB. */
export const BADGE_RED = [0xc4, 0x2b, 0x1c] as const;
export const BADGE_WHITE = [0xff, 0xff, 0xff] as const;

/** What the overlay says: the count, or "9+" past nine, since two digits are all a 16-pixel disc can hold. */
export const overlayLabel = (count: number): string => (count > 9 ? "9+" : String(count));

/** 5 × 7 glyphs for the digits and "+", one string per row, `#` for ink. */
const GLYPHS: Record<string, readonly string[]> = {
  "0": [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "3": ["####.", "....#", "....#", ".###.", "....#", "....#", "####."],
  "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
  "5": ["#####", "#....", "####.", "....#", "....#", "#...#", ".###."],
  "6": ["..##.", ".#...", "#....", "####.", "#...#", "#...#", ".###."],
  "7": ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
  "8": [".###.", "#...#", "#...#", ".###.", "#...#", "#...#", ".###."],
  "9": [".###.", "#...#", "#...#", ".####", "....#", "...#.", ".##.."],
  "+": [".....", "..#..", "..#..", "#####", "..#..", "..#..", "....."],
};
const GLYPH_W = 5;
const GLYPH_H = 7;
/** Each glyph pixel is a 2 × 2 block, with a block's gap between glyphs. */
const DOT = 2;
/** Samples per pixel side for the disc's smooth edge. */
const AA = 4;

/** Which pixels of the label's text are ink, centred in the disc. */
function inkAt(label: string): (x: number, y: number) => boolean {
  const glyphs = Array.from(label, (ch) => GLYPHS[ch] ?? []);
  const width = (glyphs.length * GLYPH_W + (glyphs.length - 1)) * DOT;
  const left = Math.floor((BADGE_PX - width) / 2);
  const top = Math.floor((BADGE_PX - GLYPH_H * DOT) / 2);
  return (x, y) => {
    const gx = Math.floor((x - left) / DOT);
    const gy = Math.floor((y - top) / DOT);
    if (x < left || y < top || gy >= GLYPH_H) return false;
    const index = Math.floor(gx / (GLYPH_W + 1));
    const column = gx % (GLYPH_W + 1);
    return column < GLYPH_W && glyphs[index]?.[gy]?.[column] === "#";
  };
}

/** How much of the pixel at (x, y) the disc covers, from 0 to 1. */
function discCover(x: number, y: number): number {
  const r = BADGE_PX / 2;
  let inside = 0;
  for (let i = 0; i < AA; i += 1)
    for (let j = 0; j < AA; j += 1) {
      const dx = x + (i + 0.5) / AA - r;
      const dy = y + (j + 0.5) / AA - r;
      if (dx * dx + dy * dy <= r * r) inside += 1;
    }
  return inside / (AA * AA);
}

/**
 * The overlay for `label` as BADGE_PX × BADGE_PX pixels in BGRA order, premultiplied, which is what Electron's
 * `nativeImage.createFromBitmap` takes on Windows.
 */
export function overlayBitmap(label: string): Buffer {
  const ink = inkAt(label);
  const out = Buffer.alloc(BADGE_PX * BADGE_PX * 4);
  for (let y = 0; y < BADGE_PX; y += 1)
    for (let x = 0; x < BADGE_PX; x += 1) {
      const alpha = discCover(x, y);
      const [r, g, b] = ink(x, y) ? BADGE_WHITE : BADGE_RED;
      const at = (y * BADGE_PX + x) * 4;
      out[at] = Math.round(b * alpha);
      out[at + 1] = Math.round(g * alpha);
      out[at + 2] = Math.round(r * alpha);
      out[at + 3] = Math.round(255 * alpha);
    }
  return out;
}
