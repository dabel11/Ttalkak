const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { assertBundleBudgets } = require("../../scripts/check-web-bundle-size.cjs");
const { assertLegacyGlobalBaseline, auditLegacyGlobals } = require("../../scripts/check-web-legacy-globals.cjs");
const { assertConsoleWarningBoundary } = require("../../scripts/check-web-observability.cjs");
const { assertLocalReference, isBundleInput } = require("../../scripts/create-web-bundle-report.cjs");

test("preview server serves ESM module files with a JavaScript MIME type", () => {
  const previewServer = fs.readFileSync(path.resolve(__dirname, "../preview-server.cjs"), "utf8");
  assert.match(previewServer, /["']\.mjs["']\s*:\s*["']text\/javascript; charset=utf-8["']/);
});

test("production build splits optional demo data out of the initial bundle", () => {
  const entry = fs.readFileSync(path.resolve(__dirname, "../src/app-entry.js"), "utf8");
  const build = fs.readFileSync(path.resolve(__dirname, "../../scripts/build-web.cjs"), "utf8");
  assert.match(entry, /runtimeConfig\.demoFallbackEnabled/);
  assert.match(entry, /await import\(["']\.\/demo-data\.mjs["']\)/);
  assert.doesNotMatch(entry, /^import\s+["']\.\/demo-data\.mjs["'];?$/m);
  assert.match(build, /splitting:\s*true/);
  assert.match(build, /charset:\s*["']utf8["']/);
  assert.match(build, /chunkNames:\s*["']chunks\//);
  assert.match(build, /bundle-metafile\.json/);
  const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../package.json"), "utf8"));
  assert.match(packageJson.scripts.verify, /analyze:bundle/);
});

test("production renderers share the Admin, Make, and Share runtime chunks", () => {
  const rendererEntry = fs.readFileSync(path.resolve(__dirname, "../src/renderers/index.js"), "utf8");
  const loader = fs.readFileSync(path.resolve(__dirname, "../src/renderers/lazy-route-renderers.js"), "utf8");
  ["admin-panels.mjs", "pages/admin-page.mjs", "pages/make-message-parts.mjs", "pages/make-page.mjs", "pages/share-page.mjs"].forEach((file) => {
    assert.doesNotMatch(rendererEntry, new RegExp(`import ["']\\./${file.replaceAll(".", "\\.")}["']`));
  });
  assert.match(loader, /admin: \(\) => import\(["']\.\.\/admin\/admin-runtime\.mjs["']\)/);
  assert.match(loader, /make: \(\) => import\(["']\.\.\/make\/make-runtime\.mjs["']\)/);
  assert.match(loader, /share: \(\) => import\(["']\.\.\/share\/share-runtime\.mjs["']\)/);
  const runtimeSources = {
    admin: fs.readFileSync(path.resolve(__dirname, "../src/admin/admin-runtime.mjs"), "utf8"),
    make: fs.readFileSync(path.resolve(__dirname, "../src/make/make-runtime.mjs"), "utf8"),
    share: fs.readFileSync(path.resolve(__dirname, "../src/share/share-runtime.mjs"), "utf8"),
  };
  assert.match(runtimeSources.admin, /renderers\/pages\/admin-page\.mjs/);
  assert.match(runtimeSources.admin, /renderers\/admin-panels\.mjs/);
  assert.match(runtimeSources.make, /renderers\/pages\/make-page\.mjs/);
  assert.match(runtimeSources.share, /renderers\/pages\/share-page\.mjs/);
});

test("Admin controller view and events load only through the Admin runtime chunk", () => {
  const adminEntry = fs.readFileSync(path.resolve(__dirname, "../src/admin/index.js"), "utf8");
  assert.match(adminEntry, /import\(["']\.\/admin-runtime\.mjs["']\)/);
  const runtimeEntry = fs.readFileSync(path.resolve(__dirname, "../src/admin/admin-runtime.mjs"), "utf8");
  ["admin-events.mjs", "admin-controller.mjs", "admin-view.mjs"].forEach((file) => assert.match(runtimeEntry, new RegExp(`["']\\./${file}["']`)));
  assert.match(adminEntry, /loadAdminRuntime/);
});

test("Share controller and events load only through the Share runtime chunk", () => {
  const shareEntry = fs.readFileSync(path.resolve(__dirname, "../src/share/index.js"), "utf8");
  assert.match(shareEntry, /import\(["']\.\/share-runtime\.mjs["']\)/);
  const runtimeEntry = fs.readFileSync(path.resolve(__dirname, "../src/share/share-runtime.mjs"), "utf8");
  ["share-controller.mjs", "share-events.mjs"].forEach((file) => assert.match(runtimeEntry, new RegExp(`["']\\./${file}["']`)));
  assert.match(shareEntry, /loadShareRuntime/);
});

test("Make controller events and workflows load only through the Make runtime chunk", () => {
  const makeEntry = fs.readFileSync(path.resolve(__dirname, "../src/make/index.js"), "utf8");
  assert.match(makeEntry, /import\(["']\.\/make-runtime\.mjs["']\)/);
  ["make-controller.mjs", "make-events.mjs", "make-workflows.mjs", "make-page-adapter.mjs"].forEach((file) => assert.doesNotMatch(makeEntry, new RegExp(file.replaceAll(".", "\\."))));
  const runtimeEntry = fs.readFileSync(path.resolve(__dirname, "../src/make/make-runtime.mjs"), "utf8");
  ["make-controller.mjs", "make-events.mjs", "make-workflows.mjs", "make-page-adapter.mjs"].forEach((file) => assert.match(runtimeEntry, new RegExp(`["']\\./${file.replaceAll(".", "\\.")}["']`)));
  const app = fs.readFileSync(path.resolve(__dirname, "../src/app.js"), "utf8");
  ["MakeFeed", "MakeTemplateBar", "MakeComposer", "MakeSidePanel", "MakeFolderButton", "MessageBubble"].forEach((name) => {
    assert.doesNotMatch(app, new RegExp(`function\\s+${name}\\s*\\(`));
  });
  assert.match(makeEntry, /loadMakeRuntime/);
  assert.match(makeEntry, /loadMakeStyles/);
});

test("Make styles are declared but not loaded before the Make route", () => {
  const html = fs.readFileSync(path.resolve(__dirname, "../index.html"), "utf8");
  assert.match(html, /data-make-style-href=["'][^"']*make\.css/);
  assert.doesNotMatch(html, /<link[^>]+href=["'][^"']*make\.css/);
});

test("bundle budgets accept values at the limit and reject regressions", () => {
  const budgets = { javascript: { files: 1, rawBytes: 10, gzipBytes: 5 }, styles: { rawBytes: 8, gzipBytes: 4 } };
  assert.doesNotThrow(() => assertBundleBudgets({ javascript: { files: 1, rawBytes: 10, gzipBytes: 5 }, styles: { files: 1, rawBytes: 8, gzipBytes: 4 } }, budgets));
  assert.throws(() => assertBundleBudgets({ javascript: { files: 2, rawBytes: 10, gzipBytes: 5 }, styles: { files: 1, rawBytes: 8, gzipBytes: 4 } }, budgets), /javascript\.files/);
  assert.throws(() => assertBundleBudgets({ javascript: { files: 1, rawBytes: 11, gzipBytes: 5 }, styles: { files: 1, rawBytes: 8, gzipBytes: 4 } }, budgets), /javascript\.rawBytes/);
  assert.throws(() => assertBundleBudgets({ javascript: { files: 0, rawBytes: 0, gzipBytes: 0 }, styles: { files: 1, rawBytes: 8, gzipBytes: 4 } }, budgets), /javascript\.files: required asset is missing/);
});

test("bundle reference permits unrelated commits and rejects stale bundle inputs", () => {
  const revisions = { head: "abcdef1", parent: "bcdef12" };
  assert.equal(isBundleInput("docker-compose.yml"), false);
  assert.equal(isBundleInput("backend/src/main/App.java"), false);
  assert.equal(isBundleInput("prompt-hub-web-frontend/test/example.test.js"), false);
  assert.equal(isBundleInput("prompt-hub-web-frontend/src/app.js"), true);
  assert.equal(isBundleInput("scripts/build-web.cjs"), true);
  assert.doesNotThrow(() => assertLocalReference("1234567", { ...revisions, paths: ["docker-compose.yml", "backend/README.md"] }));
  assert.doesNotThrow(() => assertLocalReference("bcdef12", { ...revisions, paths: ["prompt-hub-web-frontend/src/app.js"] }));
  assert.throws(
    () => assertLocalReference("1234567", { ...revisions, paths: [], ancestor: false }),
    /not an ancestor/,
  );
  assert.throws(
    () => assertLocalReference("1234567", { ...revisions, paths: ["prompt-hub-web-frontend/src/app.js"] }),
    /predates bundle input changes/,
  );
});

test("console warnings are owned only by the observability reporter", () => {
  assert.doesNotThrow(() => assertConsoleWarningBoundary([{ file: "observability/client-error-reporter.mjs", count: 1 }]));
  assert.throws(() => assertConsoleWarningBoundary([
    { file: "observability/client-error-reporter.mjs", count: 1 },
    { file: "effects/backend-effects.js", count: 1 },
  ]), /effects\/backend-effects\.js/);
});

test("legacy global baseline permits removal and rejects additions", () => {
  const baseline = { maximumFiles: 2, maximumReferences: 3, maximumAssignments: 1, allowedIdentifiers: ["TtalkakExisting"], maximumReferencesByFile: { "existing.js": 2 } };
  assert.doesNotThrow(() => assertLegacyGlobalBaseline({ files: 1, references: 2, assignments: 0, identifiers: ["TtalkakExisting"], perFile: { "existing.js": 2 } }, baseline));
  assert.throws(() => assertLegacyGlobalBaseline({ files: 3, references: 4, assignments: 2, identifiers: ["TtalkakExisting", "TtalkakNew"], perFile: { "existing.js": 3, "new.js": 1 } }, baseline), /unexpected file: new\.js/);
});

test("legacy global audit recognizes dot and bracket access on every browser global", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ttalkak-global-audit-"));
  try {
    fs.writeFileSync(path.join(root, "variants.js"), 'window.TtalkakOne = globalThis["TtalkakTwo"]; self.TtalkakThree = global[\'TtalkakFour\'];');
    const result = auditLegacyGlobals(root);
    assert.equal(result.files, 1);
    assert.equal(result.references, 4);
    assert.equal(result.assignments, 2);
    assert.deepEqual(result.identifiers, ["TtalkakFour", "TtalkakOne", "TtalkakThree", "TtalkakTwo"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("production source remains free of legacy Ttalkak globals", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const baseline = JSON.parse(fs.readFileSync(path.join(frontendRoot, "legacy-global-baseline.json"), "utf8"));
  const result = auditLegacyGlobals(path.join(frontendRoot, "src"));
  assert.deepEqual(
    { files: result.files, references: result.references, assignments: result.assignments },
    { files: 0, references: 0, assignments: 0 },
  );
  assert.deepEqual(baseline.allowedIdentifiers, []);
  assert.deepEqual(baseline.maximumReferencesByFile, {});
});

test("converted domains import named ESM implementations without legacy JavaScript fallbacks", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const converted = {
    bootstrap: ["app-bootstrap"],
    discovery: ["discovery-controller"],
    home: ["home-controller", "home-events", "home-search-model"],
    interactions: ["comment-model", "comment-view", "prompt-engagement-controller", "prompt-engagement-events", "prompt-workflows"],
    modal: ["modal-controller", "modal-events", "modal-view"],
    saved: ["saved-library-controller"],
  };
  for (const [domain, modules] of Object.entries(converted)) {
    const entry = fs.readFileSync(path.join(frontendRoot, "src", domain, "index.js"), "utf8");
    for (const moduleName of modules) {
      assert.match(entry, new RegExp(`${moduleName}\\.mjs`));
      assert.equal(fs.existsSync(path.join(frontendRoot, "src", domain, `${moduleName}.js`)), false);
    }
  }
  ["components", "utils"].forEach((moduleName) => {
    assert.equal(fs.existsSync(path.join(frontendRoot, "src", `${moduleName}.mjs`)), true);
    assert.equal(fs.existsSync(path.join(frontendRoot, "src", `${moduleName}.js`)), false);
  });
});

test("runtime configuration globals are read only by the config boundary", () => {
  const frontendRoot = path.resolve(__dirname, "..");
  const files = [];
  const walk = (directory) => fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(target);
    else if (/\.(?:js|mjs)$/.test(entry.name)) files.push(target);
  });
  walk(path.join(frontendRoot, "src"));
  const owners = files.filter((file) => /window\.(?:__API_BASE_URL__|TTALKAK_(?:API|IMPROVE|GOOGLE|DEMO))/.test(fs.readFileSync(file, "utf8")));
  assert.deepEqual(owners.map((file) => path.relative(frontendRoot, file).replaceAll("\\", "/")), []);
  const config = fs.readFileSync(path.join(frontendRoot, "src/runtime/runtime-config.mjs"), "utf8");
  ["__API_BASE_URL__", "TTALKAK_API_TIMEOUT_MS", "TTALKAK_IMPROVE_TIMEOUT_MS", "TTALKAK_GOOGLE_CREDENTIAL", "TTALKAK_DEMO_FALLBACK_ENABLED"].forEach((name) => assert.match(config, new RegExp(name)));
});

test("app orchestration stays within the reviewed size boundary", () => {
  const lines = fs.readFileSync(path.resolve(__dirname, "../src/app.js"), "utf8").split(/\r?\n/).length - 1;
  assert.ok(lines <= 2500, `app.js grew to ${lines} lines`);
});
