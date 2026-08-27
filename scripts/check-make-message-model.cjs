const fs = require("node:fs");
const { esmOutputPath, outputPath, sourcePath, transform, requestIdEsmOutputPath, requestIdSourcePath } = require("./build-make-message-model.cjs");

const expected = transform(fs.readFileSync(sourcePath, "utf8"));
const actual = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : "";
const expectedEsm = `// GENERATED FILE. Edit shared/make-message-model.js and run node scripts/build-make-message-model.cjs.\n${fs.readFileSync(sourcePath, "utf8")}`;
const actualEsm = fs.existsSync(esmOutputPath) ? fs.readFileSync(esmOutputPath, "utf8") : "";
const expectedRequestIdEsm = `// GENERATED FILE. Edit shared/make-request-id.js and run node scripts/build-make-message-model.cjs.\n${fs.readFileSync(requestIdSourcePath, "utf8")}`;
const actualRequestIdEsm = fs.existsSync(requestIdEsmOutputPath) ? fs.readFileSync(requestIdEsmOutputPath, "utf8") : "";

if (actual !== expected || actualEsm !== expectedEsm || actualRequestIdEsm !== expectedRequestIdEsm) {
  console.error("Generated Make message model is out of date.");
  console.error("Run: npm run build:shared");
  process.exitCode = 1;
} else {
  console.log("Generated Make message model is up to date.");
}
