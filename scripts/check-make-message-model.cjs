const fs = require("node:fs");
const { outputPath, sourcePath, transform } = require("./build-make-message-model.cjs");

const expected = transform(fs.readFileSync(sourcePath, "utf8"));
const actual = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : "";

if (actual !== expected) {
  console.error("Generated Make message model is out of date.");
  console.error("Run: npm run build:shared");
  process.exitCode = 1;
} else {
  console.log("Generated Make message model is up to date.");
}
