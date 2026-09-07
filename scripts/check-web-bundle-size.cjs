const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const repositoryRoot = path.resolve(__dirname, "..");
const webRoot = path.join(repositoryRoot, "prompt-hub-web-frontend");
const distRoot = path.join(webRoot, process.env.TTALKAK_WEB_OUTPUT_DIR || "dist");

function collectAssetSizes(assetRoot) {
  const totals = { javascript: { files: 0, rawBytes: 0, gzipBytes: 0 }, styles: { files: 0, rawBytes: 0, gzipBytes: 0 } };
  const visit = (directory) => fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return visit(target);
    const category = entry.name.endsWith(".js") ? "javascript" : entry.name.endsWith(".css") ? "styles" : null;
    if (!category) return;
    const content = fs.readFileSync(target);
    totals[category].files += 1;
    totals[category].rawBytes += content.length;
    totals[category].gzipBytes += zlib.gzipSync(content).length;
  });
  visit(assetRoot);
  return totals;
}

function collectFileSize(file) {
  const content = fs.readFileSync(file);
  return { files: 1, rawBytes: content.length, gzipBytes: zlib.gzipSync(content).length };
}

function assertBundleBudgets(actual, budgets) {
  const failures = [];
  for (const [category, limits] of Object.entries(budgets)) {
    if (!actual[category] || actual[category].files < 1) {
      failures.push(`${category}.files: required asset is missing`);
      continue;
    }
    for (const [metric, limit] of Object.entries(limits)) {
      if (actual[category][metric] > limit) failures.push(`${category}.${metric}: ${actual[category][metric]} > ${limit}`);
    }
  }
  if (failures.length) throw new Error(`Web bundle budget exceeded:\n${failures.join("\n")}`);
}

function main() {
  const budgets = JSON.parse(fs.readFileSync(path.join(webRoot, "bundle-budgets.json"), "utf8"));
  const actual = collectAssetSizes(path.join(distRoot, "assets"));
  const manifest = JSON.parse(fs.readFileSync(path.join(distRoot, "build-manifest.json"), "utf8"));
  actual.initialJavascript = collectFileSize(path.join(distRoot, manifest.bundle));
  assertBundleBudgets(actual, budgets);
  console.log(`Web bundle budgets passed: ${JSON.stringify(actual)}`);
}

if (require.main === module) main();
module.exports = { assertBundleBudgets, collectAssetSizes, collectFileSize };
