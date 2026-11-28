/**
 * A project's dev server for the proof journeys (STORY-25): a static page on the port given as the first argument (the
 * `{port}` of the dev-server command), on this computer only. Featra starts it in the story's worktree, captures it
 * and opens it in Preview, then stops it; nothing else starts or stops it.
 */
import { createServer } from "node:http";

const PAGE = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Shaping</title>
  <style>
    body { margin: 0; font: 16px system-ui, sans-serif; background: #fbfbfa; color: #1c1c1e; }
    header { background: #1c1c1e; color: #fff; padding: 16px 24px; font-weight: 600; }
    main { padding: 24px; }
    button { background: #3b5fcc; color: #fff; border: 0; border-radius: 6px; padding: 8px 16px; font: inherit; }
  </style></head>
  <body><header>Shaping</header><main><h1>Draft a feature</h1><p>The draft shows in Work.</p><button>Draft</button></main></body>
</html>
`;

const port = Number(process.argv[2] ?? process.env.PORT);
createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(PAGE);
}).listen(port, "127.0.0.1", () => process.stdout.write(`Ready on http://localhost:${port}\n`));
