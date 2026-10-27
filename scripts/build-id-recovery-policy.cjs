const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sourcePath = path.join(root, "shared", "id-recovery-policy.mjs");
const outputPaths = [
  path.join(root, "prompt-hub-web-frontend", "src", "policies", "id-recovery-policy.mjs"),
  path.join(root, "extension", "src", "policies", "id-recovery-policy.mjs"),
];

function transform(source) {
  return `// GENERATED FILE. Edit shared/id-recovery-policy.mjs and run node scripts/build-id-recovery-policy.cjs.\n${source}`;
}

function build() {
  const generated = transform(fs.readFileSync(sourcePath, "utf8"));
  outputPaths.forEach((outputPath) => {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, generated, "utf8");
  });
}

if (require.main === module) build();
module.exports = { build, outputPaths, sourcePath, transform };
