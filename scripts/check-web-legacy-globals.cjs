const fs = require("node:fs");
const path = require("node:path");

const repositoryRoot = path.resolve(__dirname, "..");
const webRoot = path.join(repositoryRoot, "prompt-hub-web-frontend");
const referencePattern = /(?:window|global|globalThis|self)(?:\.(Ttalkak[A-Z][A-Za-z0-9_]*)|\[\s*["'](Ttalkak[A-Z][A-Za-z0-9_]*)["']\s*\])/g;
const assignmentPattern = /(?:window|global|globalThis|self)(?:\.Ttalkak[A-Z][A-Za-z0-9_]*|\[\s*["']Ttalkak[A-Z][A-Za-z0-9_]*["']\s*\])\s*=/g;

function collectSourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(target);
    return /\.(?:js|mjs)$/.test(entry.name) ? [target] : [];
  });
}

function auditLegacyGlobals(sourceRoot) {
  const files = new Set();
  const identifiers = new Set();
  const perFile = {};
  let references = 0;
  let assignments = 0;
  for (const file of collectSourceFiles(sourceRoot)) {
    const source = fs.readFileSync(file, "utf8");
    const matches = [...source.matchAll(referencePattern)];
    if (matches.length) {
      const relativeFile = path.relative(sourceRoot, file).replaceAll("\\", "/");
      files.add(relativeFile);
      perFile[relativeFile] = matches.length;
    }
    matches.forEach((match) => identifiers.add(match[1] || match[2]));
    references += matches.length;
    assignments += [...source.matchAll(assignmentPattern)].length;
  }
  return { files: files.size, references, assignments, identifiers: [...identifiers].sort(), perFile };
}

function assertLegacyGlobalBaseline(actual, baseline) {
  const failures = [];
  if (actual.files > baseline.maximumFiles) failures.push(`files: ${actual.files} > ${baseline.maximumFiles}`);
  if (actual.references > baseline.maximumReferences) failures.push(`references: ${actual.references} > ${baseline.maximumReferences}`);
  if (actual.assignments > baseline.maximumAssignments) failures.push(`assignments: ${actual.assignments} > ${baseline.maximumAssignments}`);
  const allowed = new Set(baseline.allowedIdentifiers);
  const unexpected = actual.identifiers.filter((identifier) => !allowed.has(identifier));
  if (unexpected.length) failures.push(`unexpected identifiers: ${unexpected.join(", ")}`);
  const baselineFiles = baseline.maximumReferencesByFile || {};
  for (const [file, count] of Object.entries(actual.perFile || {})) {
    if (!(file in baselineFiles)) failures.push(`unexpected file: ${file}`);
    else if (count > baselineFiles[file]) failures.push(`${file}: ${count} > ${baselineFiles[file]}`);
  }
  if (failures.length) throw new Error(`Legacy Ttalkak globals increased:\n${failures.join("\n")}`);
}

function main() {
  const baseline = JSON.parse(fs.readFileSync(path.join(webRoot, "legacy-global-baseline.json"), "utf8"));
  const actual = auditLegacyGlobals(path.join(webRoot, "src"));
  assertLegacyGlobalBaseline(actual, baseline);
  console.log(`Legacy global baseline passed: ${actual.files} files, ${actual.references} references, ${actual.assignments} assignments.`);
}

if (require.main === module) main();
module.exports = { assertLegacyGlobalBaseline, auditLegacyGlobals };
