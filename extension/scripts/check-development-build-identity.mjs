import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_DEVELOPMENT_EXTENSION_ID = "djbhhlahjhaeccghbnajnhmbcdilccmn";
const extensionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(extensionRoot, "dist-dev", "manifest.json");

assert.ok(fs.existsSync(manifestPath), "dist-dev/manifest.json is missing; run npm run build:dev first.");

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
assert.equal(typeof manifest.key, "string", "The development build manifest must contain its public key.");

const digest = createHash("sha256")
  .update(Buffer.from(manifest.key, "base64"))
  .digest()
  .subarray(0, 16);
const actualId = [...digest]
  .flatMap((byte) => [byte >> 4, byte & 15])
  .map((nibble) => String.fromCharCode("a".charCodeAt(0) + nibble))
  .join("");

assert.equal(actualId, EXPECTED_DEVELOPMENT_EXTENSION_ID);
console.log(`Verified development Extension ID: ${actualId}`);
