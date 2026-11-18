import { readFile } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";

/**
 * Reads every file in a zip, such as a Playwright trace, into memory: name to contents. Only what traces use: stored
 * or deflated entries, no zip64. For tests that check what a trace holds (BUG-30).
 */
export async function readZip(path: string): Promise<Map<string, Buffer>> {
  const zip = await readFile(path);
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0) throw new Error(`${path} is not a zip`);
  const count = zip.readUInt16LE(end + 10);
  let at = zip.readUInt32LE(end + 16);
  const files = new Map<string, Buffer>();
  for (let i = 0; i < count; i++) {
    const method = zip.readUInt16LE(at + 10);
    const size = zip.readUInt32LE(at + 20);
    const nameLength = zip.readUInt16LE(at + 28);
    const extraLength = zip.readUInt16LE(at + 30);
    const commentLength = zip.readUInt16LE(at + 32);
    const local = zip.readUInt32LE(at + 42);
    const name = zip.toString("utf8", at + 46, at + 46 + nameLength);
    const data = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const raw = zip.subarray(data, data + size);
    files.set(name, method === 0 ? raw : inflateRawSync(raw));
    at += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}
