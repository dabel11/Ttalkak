const fs = require("node:fs");
const path = require("node:path");
const { gzipBytes, walk } = require("./create-web-bundle-report.cjs");

function value(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : "";
}

const distRoot = path.resolve(value("--dist"));
const output = path.resolve(value("--output"));
const commit = value("--commit");
if (!distRoot || !output || !commit) throw new Error("Usage: --dist <directory> --output <file> --commit <sha>");
const manifest = JSON.parse(fs.readFileSync(path.join(distRoot, "build-manifest.json"), "utf8"));
const files = walk(path.join(distRoot, "assets")).filter((file) => file.endsWith(".js"));
const initial = path.join(distRoot, manifest.bundle);
const reference = {
  commit,
  javascript: { files: files.length, rawBytes: files.reduce((sum, file) => sum + fs.statSync(file).size, 0), gzipBytes: files.reduce((sum, file) => sum + gzipBytes(file), 0) },
  initialJavascript: { rawBytes: fs.statSync(initial).size, gzipBytes: gzipBytes(initial) },
};
fs.writeFileSync(output, `${JSON.stringify(reference, null, 2)}\n`);
console.log(`Bundle reference created for ${commit}: ${reference.javascript.gzipBytes} gzip bytes.`);
