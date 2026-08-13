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
  let bundleMetafile = null;
  if (production) {
    const result = await esbuild.build({
      entryPoints: [path.join(webRoot, "src", "app-entry.js")],
      bundle: true,
      format: "esm",
      splitting: true,
      minify: true,
      charset: "utf8",
      sourcemap: false,
      target: ["es2023"],
      define: { "globalThis.TTALKAK_PRODUCTION_BUILD": "true" },
      outdir: path.join(outputRoot, "assets"),
      entryNames: "app-[hash]",
      chunkNames: "chunks/[name]-[hash]",
      metafile: true,
    });
    bundleMetafile = result.metafile;
    if (Object.values(result.metafile.outputs).some((metadata) => metadata.entryPoint?.endsWith("src/demo-data.mjs"))) {
      throw new Error("Production bundle must not contain the development-only demo data chunk.");
    }
    const output = Object.entries(result.metafile.outputs).find(([, metadata]) => metadata.entryPoint?.endsWith("src/app-entry.js"))?.[0];
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
  if (bundleMetafile) fs.writeFileSync(path.join(outputRoot, "bundle-metafile.json"), `${JSON.stringify(bundleMetafile, null, 2)}\n`, "utf8");
  fs.writeFileSync(
    path.join(outputRoot, "build-manifest.json"),
    `${JSON.stringify({
      mode: production ? "production" : "development",
      entries: requiredEntries,
      bundle,
      javascript: production
        ? fs.readdirSync(path.join(outputRoot, "assets"), { recursive: true, withFileTypes: true })
          .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
          .map((entry) => path.relative(outputRoot, path.join(entry.parentPath, entry.name)).replaceAll("\\", "/"))
          .sort()
        : [],
    }, null, 2)}\n`,
    "utf8",
  );
  console.log(`Web ${production ? "production" : "development"} build created at ${outputRoot}`);
}

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
