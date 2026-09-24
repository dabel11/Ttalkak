const fs = require("node:fs");
const { outputPaths, sourcePath, transform } = require("./build-usage-entitlement.cjs");

const expected = transform(fs.readFileSync(sourcePath, "utf8"));
const stale = outputPaths.filter((outputPath) => !fs.existsSync(outputPath) || fs.readFileSync(outputPath, "utf8") !== expected);

if (stale.length) {
  console.error("Generated usage entitlement contract is out of date.");
  console.error("Run: node scripts/build-usage-entitlement.cjs");
  process.exitCode = 1;
} else {
  console.log("Generated usage entitlement contract is up to date.");
}
