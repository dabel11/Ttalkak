const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("application runtime consumes domain modules through one named-import registry", () => {
  const root = path.resolve(__dirname, "..");
  const app = fs.readFileSync(path.join(root, "src", "app.js"), "utf8");
  const entry = fs.readFileSync(path.join(root, "src", "app-entry.js"), "utf8");
  const domainImports = ["admin", "api", "auth", "bootstrap", "effects", "events", "home", "interactions", "make", "modal", "renderers", "routing", "share", "state", "utils"];

  assert.deepEqual(app.match(/window\.Ttalkak[A-Za-z0-9_]*/g), ["window.TtalkakModules"]);
  assert.doesNotMatch(app, /window\.TTALKAK_API/);
  domainImports.forEach((domain) => assert.match(entry, new RegExp(`from "\\./${domain}/index\\.js"`)));
  assert.match(entry, /window\.TtalkakModules = Object\.freeze/);
  assert.match(entry, /await import\("\.\/app\.js"\)/);
});
