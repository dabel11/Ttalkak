const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("application runtime consumes domain modules through explicit imports and arguments", () => {
  const root = path.resolve(__dirname, "..");
  const app = fs.readFileSync(path.join(root, "src", "app.js"), "utf8");
  const entry = fs.readFileSync(path.join(root, "src", "app-entry.js"), "utf8");
  const domainImports = ["admin", "api", "auth", "bootstrap", "effects", "events", "home", "interactions", "make", "modal", "renderers", "routing", "share", "state", "utils"];

  assert.equal(app.match(/window\.Ttalkak[A-Za-z0-9_]*/g), null);
  assert.doesNotMatch(app, /window\.TTALKAK_API/);
  domainImports.forEach((domain) => assert.match(entry, new RegExp(`from "\\./${domain}/index\\.js"`)));
  assert.match(entry, /import \{ startApp \} from "\.\/app\.js"/);
  assert.match(entry, /const modules = Object\.freeze/);
  assert.match(entry, /startApp\(modules\)/);
  assert.doesNotMatch(entry, /window\.TtalkakModules/);
});
