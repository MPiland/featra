// Lint fixture (STORY-2): the imports the server may use. Linted only by tooling/test/lint-rules.test.ts.
import { readFile } from "node:fs/promises";
import { parseRequest } from "@featra/work-format/protocol";
import { WebSocketServer } from "ws";

export const uses = { readFile, parseRequest, WebSocketServer };
