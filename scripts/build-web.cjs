const fs = require("node:fs");
const path = require("node:path");

const repositoryRoot = path.resolve(__dirname, "..");
const webRoot = path.join(repositoryRoot, "prompt-hub-web-frontend");
const outputRoot = path.join(webRoot, "dist");
const production = process.argv.includes("--production");
const requiredEntries = ["index.html", "src"];
const esbuild = require(path.join(webRoot, "node_modules", "esbuild"));

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

async function build() {
  assertSafeOutputPath();
  validateSources();
  fs.rmSync(outputRoot, { recursive: true, force: true });
  fs.mkdirSync(outputRoot, { recursive: true });
  let html = fs.readFileSync(path.join(webRoot, "index.html"), "utf8");
  let bundle = "src/app-entry.js";
  if (production) {
    const result = await esbuild.build({
      entryPoints: [path.join(webRoot, "src", "app-entry.js")],
      bundle: true,
      format: "esm",
      minify: true,
      sourcemap: false,
      target: ["es2023"],
      outdir: path.join(outputRoot, "assets"),
      entryNames: "app-[hash]",
      metafile: true,
    });
    const output = Object.keys(result.metafile.outputs).find((file) => file.endsWith(".js"));
    if (!output) throw new Error("Production bundle output was not created.");
    bundle = path.relative(outputRoot, path.resolve(output)).replaceAll("\\", "/");
    html = html.replace('./src/app-entry.js', `./${bundle}`);
    fs.mkdirSync(path.join(outputRoot, "assets", "styles"), { recursive: true });
    fs.copyFileSync(path.join(webRoot, "src", "styles.css"), path.join(outputRoot, "assets", "styles.css"));
    fs.copyFileSync(path.join(webRoot, "src", "styles", "make.css"), path.join(outputRoot, "assets", "styles", "make.css"));
    html = html.replaceAll("./src/styles.css", "./assets/styles.css").replaceAll("./src/styles/make.css", "./assets/styles/make.css");
  } else {
    fs.cpSync(path.join(webRoot, "src"), path.join(outputRoot, "src"), { recursive: true });
  }
  fs.writeFileSync(path.join(outputRoot, "index.html"), html, "utf8");
  fs.writeFileSync(
    path.join(outputRoot, "build-manifest.json"),
    `${JSON.stringify({ mode: production ? "production" : "development", entries: requiredEntries, bundle }, null, 2)}\n`,
    "utf8",
  );
  console.log(`Web ${production ? "production" : "development"} build created at ${outputRoot}`);
}

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
