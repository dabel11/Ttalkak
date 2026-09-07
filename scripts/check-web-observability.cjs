const fs = require("node:fs");
const path = require("node:path");

const repositoryRoot = path.resolve(__dirname, "..");
const webRoot = path.join(repositoryRoot, "prompt-hub-web-frontend");
const allowedFile = "observability/client-error-reporter.mjs";

function collectConsoleWarnings(directory, root = directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectConsoleWarnings(target, root);
    if (!/\.(?:js|mjs)$/.test(entry.name)) return [];
    const source = fs.readFileSync(target, "utf8");
    const count = [...source.matchAll(/console\.warn\b/g)].length;
    return count ? [{ file: path.relative(root, target).replaceAll("\\", "/"), count }] : [];
  });
}

function assertConsoleWarningBoundary(usages) {
  const unexpected = usages.filter(({ file }) => file !== allowedFile);
  const reporterUsage = usages.find(({ file }) => file === allowedFile)?.count || 0;
  if (unexpected.length || reporterUsage !== 1) {
    const details = unexpected.map(({ file, count }) => `${file}: ${count}`).join("\n");
    throw new Error(`Direct console.warn must stay inside ${allowedFile}.${details ? `\n${details}` : ""}`);
  }
}

function main() {
  const usages = collectConsoleWarnings(path.join(webRoot, "src"));
  assertConsoleWarningBoundary(usages);
  console.log(`Frontend warning boundary passed: ${allowedFile} is the only console.warn owner.`);
}

if (require.main === module) main();
module.exports = { assertConsoleWarningBoundary, collectConsoleWarnings };
