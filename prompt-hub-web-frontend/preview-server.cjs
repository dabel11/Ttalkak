const http = require("http");
const fs = require("fs");
const path = require("path");
const { renderPublicMerchant } = require("../scripts/render-public-merchant.cjs");

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

const server = http.createServer((request, response) => {
    const url = new URL(request.url, `http://${host}:${port}`);
    const requestedPath = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
    if (url.pathname === "/pricing/") {
      response.writeHead(308, { Location: `/pricing${url.search}` }); response.end(); return;
    }
    const normalizedPath = requestedPath === "/" || requestedPath === "\\" || requestedPath === "/pricing" ? "index.html" : requestedPath.replace(/^[/\\]/, "");
    const filePath = path.join(root, normalizedPath);

    fs.readFile(filePath, (error, content) => {
      if (error) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Not found");
        return;
      }

      // Fixture previews serve source HTML, while the production build injects
      // the public policy/contact navigation at build time. Use the same
      // renderer so browser tests exercise the actual delivered navigation.
      // Dist previews already contain the rendered footer; do not render twice.
      let body = content;
      if (root === __dirname && path.extname(filePath).toLowerCase() === ".html") {
        const html = content.toString("utf8");
        if (html.includes("<!-- TTALKAK_PUBLIC_MERCHANT -->")) {
          try {
            body = renderPublicMerchant(html);
          } catch (renderError) {
            console.error("Preview policy navigation render failed:", renderError);
            response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
            response.end("Preview unavailable");
            return;
          }
        }
      }

      response.writeHead(200, {
        "Content-Type": types[path.extname(filePath).toLowerCase()] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      response.end(body);
    });
  });

server.on("error", (error) => {
  if (error && error.code === "EADDRINUSE") {
    console.error(`Preview server could not start: ${host}:${port} is already in use. Stop the process using the port or set TTALKAK_E2E_PORT to a free port.`);
    process.exitCode = 1;
    return;
  }
  throw error;
});

server.listen(port, host, () => {
  console.log(`Preview server running at http://${host}:${port}/`);
});
