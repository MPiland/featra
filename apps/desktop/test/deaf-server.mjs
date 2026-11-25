/**
 * A server process that never exits when main stops it (server-process-stop.test.ts): it says it listens, then ignores
 * the IPC channel closing, kept alive by a socket server of its own.
 */
import { createServer } from "node:net";

const held = createServer().listen(0, "127.0.0.1", () => {
  process.on("message", (message) => {
    if (message?.type === "start") process.send?.({ type: "listening", port: held.address().port });
  });
  process.on("disconnect", () => {});
});
