const fs = require("node:fs");
const { expectedOutputs, javaOutputPath, jsOutputPath } = require("./build-make-api-contract.cjs");

const expected = expectedOutputs();
const actualJs = fs.existsSync(jsOutputPath) ? fs.readFileSync(jsOutputPath, "utf8") : "";
const actualJava = fs.existsSync(javaOutputPath) ? fs.readFileSync(javaOutputPath, "utf8") : "";
const normalizeLines = (value) => value.replace(/\r\n/g, "\n");

if (normalizeLines(actualJs) !== normalizeLines(expected.js) || normalizeLines(actualJava) !== normalizeLines(expected.java)) {
  console.error("Generated Make API contract is out of date.");
  console.error("Run: node scripts/build-make-api-contract.cjs");
  process.exitCode = 1;
} else {
  console.log("Generated Make API contract is up to date.");
}
