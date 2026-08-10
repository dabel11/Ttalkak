const http = require("http");
const fs = require("fs");
const path = require("path");

const requestedRoot = process.env.TTALKAK_PREVIEW_ROOT || ".";
const root = path.resolve(__dirname, requestedRoot);
if (root !== __dirname && !root.startsWith(`${__dirname}${path.sep}`)) throw new Error("Preview root must stay inside the web workspace.");
const port = Number(process.env.TTALKAK_PREVIEW_PORT || 4173);
const host = "127.0.0.1";
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

http
  .createServer((request, response) => {
    const url = new URL(request.url, `http://${host}:${port}`);
    const requestedPath = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
    const normalizedPath = requestedPath === "/" || requestedPath === "\\" ? "index.html" : requestedPath.replace(/^[/\\]/, "");
    const filePath = path.join(root, normalizedPath);

    fs.readFile(filePath, (error, content) => {
      if (error) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Not found");
        return;
      }

      response.writeHead(200, {
        "Content-Type": types[path.extname(filePath).toLowerCase()] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      response.end(content);
    });
  })
  .listen(port, host, () => {
    console.log(`Preview server running at http://${host}:${port}/`);
  });
