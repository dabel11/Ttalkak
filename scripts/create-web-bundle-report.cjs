const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { execFileSync } = require("node:child_process");

const repositoryRoot = path.resolve(__dirname, "..");
const webRoot = path.join(repositoryRoot, "prompt-hub-web-frontend");
const distRoot = path.join(webRoot, "dist");

function gzipBytes(file) { return zlib.gzipSync(fs.readFileSync(file)).length; }
function gitRevision(reference) { return execFileSync("git", ["rev-parse", "--short", reference], { cwd: repositoryRoot, encoding: "utf8" }).trim(); }
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

function createReport() {
  const manifest = JSON.parse(fs.readFileSync(path.join(distRoot, "build-manifest.json"), "utf8"));
  const metafile = JSON.parse(fs.readFileSync(path.join(distRoot, "bundle-metafile.json"), "utf8"));
  const reference = JSON.parse(fs.readFileSync(path.join(webRoot, "bundle-reference.json"), "utf8"));
  const head = gitRevision("HEAD");
  const parent = gitRevision("HEAD^");
  if (![head, parent].some((revision) => revision.startsWith(reference.commit) || reference.commit.startsWith(revision))) {
    throw new Error(`Bundle reference ${reference.commit} must identify HEAD (${head}) during local development or its direct parent (${parent}) in CI.`);
  }
  const chunks = walk(path.join(distRoot, "assets")).filter((file) => file.endsWith(".js")).map((file) => ({
    file: path.relative(distRoot, file).replaceAll("\\", "/"), rawBytes: fs.statSync(file).size, gzipBytes: gzipBytes(file),
  })).sort((a, b) => b.gzipBytes - a.gzipBytes);
  const inputBytes = new Map();
  Object.values(metafile.outputs).forEach((output) => Object.entries(output.inputs || {}).forEach(([input, details]) => inputBytes.set(input, (inputBytes.get(input) || 0) + details.bytesInOutput)));
  const largestInputs = [...inputBytes].map(([file, bytesInOutput]) => ({ file: path.relative(repositoryRoot, file).replaceAll("\\", "/"), bytesInOutput })).sort((a, b) => b.bytesInOutput - a.bytesInOutput).slice(0, 20);
  const total = { files: chunks.length, rawBytes: chunks.reduce((sum, item) => sum + item.rawBytes, 0), gzipBytes: chunks.reduce((sum, item) => sum + item.gzipBytes, 0) };
  const initialFile = path.join(distRoot, manifest.bundle);
  const initial = { file: manifest.bundle, rawBytes: fs.statSync(initialFile).size, gzipBytes: gzipBytes(initialFile) };
  return { revision: head, reference: reference.commit, total, initial, delta: { files: total.files - reference.javascript.files, rawBytes: total.rawBytes - reference.javascript.rawBytes, gzipBytes: total.gzipBytes - reference.javascript.gzipBytes, initialGzipBytes: initial.gzipBytes - reference.initialJavascript.gzipBytes }, chunks, largestInputs };
}

function main() {
  const report = createReport();
  fs.writeFileSync(path.join(distRoot, "bundle-analysis.json"), `${JSON.stringify(report, null, 2)}\n`);
  const lines = ["# Web bundle analysis", "", `Reference: \`${report.reference}\``, "", `- JavaScript: ${report.total.files} files, ${report.total.gzipBytes} gzip bytes (${report.delta.gzipBytes >= 0 ? "+" : ""}${report.delta.gzipBytes})`, `- Initial JavaScript: ${report.initial.gzipBytes} gzip bytes (${report.delta.initialGzipBytes >= 0 ? "+" : ""}${report.delta.initialGzipBytes})`, "", "## Largest chunks", "", ...report.chunks.slice(0, 15).map((item) => `- \`${item.file}\`: ${item.gzipBytes} gzip bytes`), "", "## Largest source inputs", "", ...report.largestInputs.map((item) => `- \`${item.file}\`: ${item.bytesInOutput} output bytes`), ""];
  fs.writeFileSync(path.join(distRoot, "bundle-analysis.md"), lines.join("\n"));
  console.log(`Web bundle report created: ${report.total.files} JS files, ${report.total.gzipBytes} gzip bytes, delta ${report.delta.gzipBytes}.`);
}

if (require.main === module) main();
module.exports = { createReport };
