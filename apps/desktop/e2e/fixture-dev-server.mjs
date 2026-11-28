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

/**
 * A page with no viewport meta (STORY-75), so a phone lays it out at 980 px and draws it scaled: a magenta block well
 * down it, for an annotation's screenshot to be checked against.
 */
const PLAIN = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Plain</title></head>
  <body style="margin:0;height:3000px;background:#fff">
    <div id="block" style="position:absolute;left:200px;top:900px;width:300px;height:200px;background:#c828c8"></div>
  </body>
</html>
`;

const port = Number(process.argv[2] ?? process.env.PORT);
createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(req.url === "/plain" ? PLAIN : PAGE);
}).listen(port, "127.0.0.1", () => process.stdout.write(`Ready on http://localhost:${port}\n`));
