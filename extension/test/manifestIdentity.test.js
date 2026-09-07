import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import test from "node:test";

const DEVELOPMENT_EXTENSION_ID = "djbhhlahjhaeccghbnajnhmbcdilccmn";

function extensionIdFromPublicKey(publicKey) {
  const digest = createHash("sha256")
    .update(Buffer.from(publicKey, "base64"))
    .digest()
    .subarray(0, 16);
  return [...digest]
    .flatMap((byte) => [byte >> 4, byte & 15])
    .map((nibble) => String.fromCharCode("a".charCodeAt(0) + nibble))
    .join("");
}

test("development manifest has the stable team extension ID", () => {
  const manifest = JSON.parse(fs.readFileSync(new URL("../public/manifest.json", import.meta.url), "utf8"));
  assert.equal(extensionIdFromPublicKey(manifest.key), DEVELOPMENT_EXTENSION_ID);
});

test("production manifest does not reuse the development extension key", () => {
  const manifest = JSON.parse(
    fs.readFileSync(new URL("../manifest.production.example.json", import.meta.url), "utf8")
  );
  assert.equal(manifest.key, undefined);
});
