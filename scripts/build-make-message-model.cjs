const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sourcePath = path.join(root, "shared", "make-message-model.js");
const outputPath = path.join(root, "prompt-hub-web-frontend", "src", "utils", "make-message-model.js");

function transform(source) {
  const body = String(source)
    .replace(/^export default MakeMessageModel;?\s*$/m, "")
    .replace(/^export\s+(?=(const|function)\s)/gm, "")
    .trim();
  return `// GENERATED FILE. Edit shared/make-message-model.js and run node scripts/build-make-message-model.cjs.\n(function attachMakeMessageModel(global) {\n  "use strict";\n${body.split("\n").map((line) => line ? `  ${line}` : "").join("\n")}\n  global.TtalkakMakeMessageModel = MakeMessageModel;\n  if (typeof module !== "undefined" && module.exports) module.exports = MakeMessageModel;\n})(typeof window !== "undefined" ? window : globalThis);\n`;
}

function build() {
  fs.writeFileSync(outputPath, transform(fs.readFileSync(sourcePath, "utf8")), "utf8");
}

if (require.main === module) build();
module.exports = { build, transform, outputPath, sourcePath };
