const http = require("node:http");

const host = "127.0.0.1";
const port = Number(process.env.TTALKAK_STUB_RAG_PORT || 8000);

const server = http.createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: "ok" }));
    return;
  }
  if (request.method !== "POST" || request.url !== "/query") {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not_found" }));
    return;
  }

  let body = "";
  request.setEncoding("utf8");
  request.on("data", (chunk) => { body += chunk; });
  request.on("end", () => {
    let payload;
    try { payload = JSON.parse(body || "{}"); } catch { payload = {}; }
    const query = String(payload.query || "").trim();
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({
      mode: "improve",
      answer: `개선된 ${query}`,
      improvedPrompt: `개선된 ${query}`,
      summary: "실제 Backend 통합 smoke 응답",
      sources: [{ id: "integration-stub", title: "Integration stub" }],
      ragStatus: "ok",
      techniquesApplied: ["integration-smoke"],
      changes: ["실제 HTTP 연동 확인"],
      questions: [],
      fields: [],
      score: 1,
    }));
  });
});

server.listen(port, host, () => {
  console.log(`Stub RAG server listening at http://${host}:${port}`);
});
