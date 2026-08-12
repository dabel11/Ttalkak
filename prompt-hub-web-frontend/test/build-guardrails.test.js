const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { assertBundleBudgets } = require("../../scripts/check-web-bundle-size.cjs");
const { assertLegacyGlobalBaseline, auditLegacyGlobals } = require("../../scripts/check-web-legacy-globals.cjs");
const { assertConsoleWarningBoundary } = require("../../scripts/check-web-observability.cjs");

test("preview server serves ESM module files with a JavaScript MIME type", () => {
  const previewServer = fs.readFileSync(path.resolve(__dirname, "../preview-server.cjs"), "utf8");
  assert.match(previewServer, /["']\.mjs["']\s*:\s*["']text\/javascript; charset=utf-8["']/);
});

test("production build splits optional demo data out of the initial bundle", () => {
  const entry = fs.readFileSync(path.resolve(__dirname, "../src/app-entry.js"), "utf8");
  const build = fs.readFileSync(path.resolve(__dirname, "../../scripts/build-web.cjs"), "utf8");
  assert.match(entry, /TTALKAK_DEMO_FALLBACK_ENABLED\s*===\s*true/);
  assert.match(entry, /await import\(["']\.\/demo-data\.js["']\)/);
  assert.doesNotMatch(entry, /^import\s+["']\.\/demo-data\.js["'];?$/m);
  assert.match(build, /splitting:\s*true/);
  assert.match(build, /chunkNames:\s*["']chunks\//);
});

test("production renderers keep Admin, Make, and Share behind route chunks", () => {
  const rendererEntry = fs.readFileSync(path.resolve(__dirname, "../src/renderers/index.js"), "utf8");
  const loader = fs.readFileSync(path.resolve(__dirname, "../src/renderers/lazy-route-renderers.js"), "utf8");
  ["admin-panels.js", "pages/admin-page.js", "pages/make-message-parts.js", "pages/make-page.js", "pages/share-page.js"].forEach((file) => {
    assert.doesNotMatch(rendererEntry, new RegExp(`import ["']\\./${file.replaceAll(".", "\\.")}["']`));
  });
  ["admin", "make", "share"].forEach((route) => {
    assert.match(loader, new RegExp(`${route}: \\(\\) => import\\(["']\\./routes/${route}\\.js["']\\)`));
  });
});

test("Admin controller view and events load only through the Admin runtime chunk", () => {
  const adminEntry = fs.readFileSync(path.resolve(__dirname, "../src/admin/index.js"), "utf8");
  assert.doesNotMatch(adminEntry, /^import "\.\/admin-(?:events|controller|view)\.js";/m);
  ["admin-events.js", "admin-controller.js", "admin-view.js"].forEach((file) => {
    assert.match(adminEntry, new RegExp(`import\\(["']\\./${file}["']\\)`));
  });
  assert.match(adminEntry, /loadAdminRuntime/);
});

test("Share controller and events load only through the Share runtime chunk", () => {
  const shareEntry = fs.readFileSync(path.resolve(__dirname, "../src/share/index.js"), "utf8");
  assert.doesNotMatch(shareEntry, /^import "\.\/share-(?:controller|events)\.js";/m);
  ["share-controller.js", "share-events.js"].forEach((file) => {
    assert.match(shareEntry, new RegExp(`import\\(["']\\./${file}["']\\)`));
  });
  assert.match(shareEntry, /loadShareRuntime/);
});

test("Make controller events and workflows load only through the Make runtime chunk", () => {
  const makeEntry = fs.readFileSync(path.resolve(__dirname, "../src/make/index.js"), "utf8");
  assert.match(makeEntry, /import\(["']\.\/make-runtime\.mjs["']\)/);
  ["make-controller.js", "make-events.js", "make-workflows.mjs", "make-page-adapter.mjs"].forEach((file) => assert.doesNotMatch(makeEntry, new RegExp(file.replaceAll(".", "\\."))));
  const runtimeEntry = fs.readFileSync(path.resolve(__dirname, "../src/make/make-runtime.mjs"), "utf8");
  ["make-controller.js", "make-events.js", "make-workflows.mjs", "make-page-adapter.mjs"].forEach((file) => assert.match(runtimeEntry, new RegExp(`["']\\./${file.replaceAll(".", "\\.")}["']`)));
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
