/**
 * The evidence turn of fake-agent-sdk.mjs (STORY-72), with FEATRA_E2E_REPORT=evidence: the Dev Lead drafts the first
 * story with three criteria, and its session attaches a screenshot to the first, a text file to the second and another
 * screenshot to the third through the Featra MCP's real update_card tool. Each screenshot is a real PNG drawn here.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { callMcpTool } from "./fake-mcp-client.mjs";

const EVIDENCE_CRITERIA = ["The draft shows in Work", "The log says it drafted", "The old draft is kept"];
const FILES = ["draft.png", "notes.txt", "before.png"];

/** The first drafted story's criteria: three to attach evidence to in the evidence run, else the one it always had. */
export const draftCriteria = () =>
  process.env.FEATRA_E2E_REPORT === "evidence" ? EVIDENCE_CRITERIA : ["The draft shows in Work"];

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(body));
  return Buffer.concat([head, body, tail]);
}

/** A PNG that looks like a small app window: a dark title bar, a sidebar, a light page and a blue button. */
export function screenshotPng(width, height) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bits per channel
  header[9] = 2; // RGB
  const stride = width * 3 + 1;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const button = x > width * 0.6 && x < width * 0.85 && y > height * 0.7 && y < height * 0.82;
      let rgb = [251, 251, 250];
      if (y < height * 0.1) rgb = [28, 28, 30];
      else if (x < width * 0.2) rgb = [242, 242, 241];
      else if (button) rgb = [59, 95, 204];
      pixels.set(rgb, y * stride + 1 + x * 3);
    }
  }
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** A story session's first turn in the evidence run: writes its evidence, then links it to each criterion. */
export async function* evidenceTurn(h, options, text) {
  const { assistant, toolResult, say, success, next } = h;
  const spec = options.mcpServers?.featra;
  const story = /STORY-\d+/.exec(text)?.[0];
  const feature = /FEAT-\d+/.exec(text)?.[0];
  if (!spec || !story || !feature) {
    yield* say("No Featra MCP.");
    yield success("No Featra MCP.");
    return;
  }
  const folder = `.featra/evidence/${feature}/${story}`;
  mkdirSync(join(options.cwd, folder), { recursive: true });
  writeFileSync(join(options.cwd, folder, FILES[0]), screenshotPng(480, 300));
  writeFileSync(join(options.cwd, folder, FILES[1]), "Drafted FEAT-2 with two stories.\n");
  writeFileSync(join(options.cwd, folder, FILES[2]), screenshotPng(240, 150));
  const input = {
    criteria: EVIDENCE_CRITERIA.map((criterion, i) => ({ criterion, evidence: `${folder}/${FILES[i]}` })),
    note: "Attached a screenshot and the log.",
  };
  const id = `toolu_mcp_${next()}`;
  yield assistant(`msg_${next()}`, [{ type: "tool_use", id, name: "mcp__featra__update_card", input }]);
  const result = await callMcpTool(spec, "update_card", input);
  yield toolResult(id, result.text, result.isError);
  yield* say(`Tool said: ${result.text}`);
  yield success("Done.");
}
