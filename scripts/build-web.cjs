const fs = require("node:fs");
const path = require("node:path");

const repositoryRoot = path.resolve(__dirname, "..");
const webRoot = path.join(repositoryRoot, "prompt-hub-web-frontend");
const outputRoot = path.join(webRoot, "dist");
const production = process.argv.includes("--production");
const requiredEntries = ["index.html", "src"];

function assertSafeOutputPath() {
  if (path.dirname(outputRoot) !== webRoot || path.basename(outputRoot) !== "dist") {
    throw new Error(`Unsafe web build output path: ${outputRoot}`);
  }
}

function validateSources() {
  for (const entry of requiredEntries) {
    if (!fs.existsSync(path.join(webRoot, entry))) {
      throw new Error(`Required web build entry is missing: ${entry}`);
    }
  }

  const html = fs.readFileSync(path.join(webRoot, "index.html"), "utf8");
  const referencedFiles = [...html.matchAll(/(?:src|href)="\.\/([^"?#]+)/g)].map((match) => match[1]);
  for (const referencedFile of referencedFiles) {
    if (!fs.existsSync(path.join(webRoot, referencedFile))) {
      throw new Error(`index.html references a missing file: ${referencedFile}`);
    }
  }

  if (production && !/TTALKAK_DEMO_FALLBACK_ENABLED\s*=\s*false/.test(html)) {
    throw new Error("Production build requires TTALKAK_DEMO_FALLBACK_ENABLED to be false.");
  }
}

function build() {
  assertSafeOutputPath();
  validateSources();
  fs.rmSync(outputRoot, { recursive: true, force: true });
  fs.mkdirSync(outputRoot, { recursive: true });
  fs.copyFileSync(path.join(webRoot, "index.html"), path.join(outputRoot, "index.html"));
  fs.cpSync(path.join(webRoot, "src"), path.join(outputRoot, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(outputRoot, "build-manifest.json"),
    `${JSON.stringify({ mode: production ? "production" : "development", entries: requiredEntries }, null, 2)}\n`,
    "utf8",
  );
  console.log(`Web ${production ? "production" : "development"} build created at ${outputRoot}`);
}

build();
