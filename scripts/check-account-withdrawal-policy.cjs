const fs = require("node:fs");
const { outputPaths, sourcePath, transform } = require("./build-account-withdrawal-policy.cjs");

const expected = transform(fs.readFileSync(sourcePath, "utf8"));
const stale = outputPaths.filter((outputPath) => !fs.existsSync(outputPath) || fs.readFileSync(outputPath, "utf8") !== expected);

if (stale.length > 0) {
  console.error("Generated account withdrawal policy is out of date.");
  console.error("Run: node scripts/build-account-withdrawal-policy.cjs");
  process.exitCode = 1;
} else {
  console.log("Generated account withdrawal policy is up to date.");
}
