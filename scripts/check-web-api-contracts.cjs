const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const frontendRoot = path.join(repoRoot, "prompt-hub-web-frontend");
const apiDir = path.join(frontendRoot, "src", "api");
const contract = require(path.join(apiDir, "api-contract.js"));

function sorted(values) {
  return [...new Set(values)].sort();
}

function difference(left, right) {
  const rightSet = new Set(right);
  return left.filter((value) => !rightSet.has(value));
}

const implementationMethods = [];
for (const file of fs.readdirSync(apiDir).filter((name) => name.endsWith("-api.js") && name !== "core-api.js")) {
  const source = fs.readFileSync(path.join(apiDir, file), "utf8");
  for (const match of source.matchAll(/^\s{6}(?:async\s+)?([A-Za-z][A-Za-z0-9_]*)\s*\(/gm)) implementationMethods.push(match[1]);
  for (const match of source.matchAll(/^\s{4}async function ([A-Za-z][A-Za-z0-9_]*)\s*\(/gm)) implementationMethods.push(match[1]);
}

const declarations = fs.readFileSync(path.join(frontendRoot, "types", "browser-globals.d.ts"), "utf8");
const apiInterface = declarations.match(/interface TtalkakApi \{([\s\S]*?)\n\}/)?.[1] || "";
const declaredMethods = [...apiInterface.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9_]*)\s*\(/gm)].map((match) => match[1]);

const implemented = sorted(implementationMethods);
const required = sorted(contract.REQUIRED_METHODS);
const contracted = sorted(Object.keys(contract.RESPONSE_CONTRACTS));
const declared = sorted(declaredMethods);
const failures = [
  ["implementation missing from REQUIRED_METHODS", difference(implemented, required)],
  ["stale REQUIRED_METHODS entry", difference(required, implemented)],
  ["implementation missing response contract", difference(implemented, contracted)],
  ["stale response contract", difference(contracted, implemented)],
  ["implementation missing TtalkakApi declaration", difference(implemented, declared)],
  ["stale TtalkakApi declaration", difference(declared, implemented)],
].filter(([, values]) => values.length);

if (failures.length) {
  for (const [label, values] of failures) console.error(`${label}: ${values.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log(`Web API contracts are complete: ${implemented.length} public methods.`);
}
