const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { execFileSync } = require("node:child_process");

const repositoryRoot = path.resolve(__dirname, "..");
const webRoot = path.join(repositoryRoot, "prompt-hub-web-frontend");
const distRoot = path.join(webRoot, process.env.TTALKAK_WEB_OUTPUT_DIR || "dist");

function gzipBytes(file) { return zlib.gzipSync(fs.readFileSync(file)).length; }
function gitRevision(reference) { return execFileSync("git", ["rev-parse", "--short", reference], { cwd: repositoryRoot, encoding: "utf8" }).trim(); }
function isGitAncestor(reference) {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", reference, "HEAD"], { cwd: repositoryRoot, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
function changedPaths(reference) {
  return execFileSync("git", ["diff", "--name-only", `${reference}..HEAD`], { cwd: repositoryRoot, encoding: "utf8" })
    .split(/\r?\n/)
    .filter(Boolean);
}
function isBundleInput(file) {
  const normalized = file.replaceAll("\\", "/");
  return normalized === "prompt-hub-web-frontend/index.html"
    || normalized === "prompt-hub-web-frontend/package.json"
    || normalized === "prompt-hub-web-frontend/package-lock.json"
    || normalized.startsWith("prompt-hub-web-frontend/src/")
    || normalized === "scripts/build-web.cjs";
}
function assertLocalReference(referenceCommit, { head, parent, paths, ancestor = true }) {
  const identifies = (revision) => revision.startsWith(referenceCommit) || referenceCommit.startsWith(revision);
  if (identifies(head) || identifies(parent)) return;
  if (!ancestor) throw new Error(`Bundle reference ${referenceCommit} is not an ancestor of HEAD (${head}).`);
  const changedInputs = paths.filter(isBundleInput);
  if (changedInputs.length === 0) return;
  throw new Error(
    `Bundle reference ${referenceCommit} predates bundle input changes for HEAD (${head}): ${changedInputs.slice(0, 5).join(", ")}`,
  );
}
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

function createReport() {
  const manifest = JSON.parse(fs.readFileSync(path.join(distRoot, "build-manifest.json"), "utf8"));
  const metafile = JSON.parse(fs.readFileSync(path.join(distRoot, "bundle-metafile.json"), "utf8"));
  const referencePath = process.env.TTALKAK_BUNDLE_REFERENCE_PATH || path.join(webRoot, "bundle-reference.json");
  const reference = JSON.parse(fs.readFileSync(referencePath, "utf8"));
  const head = gitRevision("HEAD");
  const parent = gitRevision("HEAD^");
  if (!process.env.TTALKAK_BUNDLE_REFERENCE_PATH) {
    assertLocalReference(reference.commit, {
      head,
      parent,
      paths: changedPaths(reference.commit),
      ancestor: isGitAncestor(reference.commit),
    });
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
module.exports = { assertLocalReference, createReport, gzipBytes, isBundleInput, walk };
