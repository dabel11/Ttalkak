const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sourcePath = path.join(root, "shared", "make-message-model.js");
const outputPath = path.join(root, "prompt-hub-web-frontend", "src", "utils", "make-message-model.js");
const esmOutputPath = path.join(root, "prompt-hub-web-frontend", "src", "utils", "make-message-model.mjs");
const requestIdSourcePath = path.join(root, "shared", "make-request-id.js");
const requestIdEsmOutputPath = path.join(root, "prompt-hub-web-frontend", "src", "utils", "make-request-id.mjs");

function transform(source) {
  const body = String(source)
    .replace(/^export default MakeMessageModel;?\s*$/m, "")
    .replace(/^export\s+(?=(const|function)\s)/gm, "")
    .trim();
  return `// GENERATED FILE. Edit shared/make-message-model.js and run node scripts/build-make-message-model.cjs.\n"use strict";\n${body}\nmodule.exports = MakeMessageModel;\n`;
}

function build() {
  const source = fs.readFileSync(sourcePath, "utf8");
  fs.writeFileSync(outputPath, transform(source), "utf8");
  fs.writeFileSync(esmOutputPath, `// GENERATED FILE. Edit shared/make-message-model.js and run node scripts/build-make-message-model.cjs.\n${source}`, "utf8");
  const requestIdSource = fs.readFileSync(requestIdSourcePath, "utf8");
  fs.writeFileSync(requestIdEsmOutputPath, `// GENERATED FILE. Edit shared/make-request-id.js and run node scripts/build-make-message-model.cjs.\n${requestIdSource}`, "utf8");
}

if (require.main === module) build();
module.exports = { build, transform, esmOutputPath, outputPath, sourcePath, requestIdEsmOutputPath, requestIdSourcePath };
