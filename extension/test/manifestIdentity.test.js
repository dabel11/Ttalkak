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

test("manifests expose localized identity and correctly sized icons", () => {
  const extensionRoot = new URL("../", import.meta.url);
  const manifests = ["public/manifest.json", "manifest.production.example.json"].map((file) =>
    JSON.parse(fs.readFileSync(new URL(file, extensionRoot), "utf8"))
  );
  for (const manifest of manifests) {
    assert.equal(manifest.default_locale, "ko");
    assert.equal(manifest.name, "__MSG_extensionName__");
    assert.equal(manifest.description, "__MSG_extensionDescription__");
    for (const [size, relativePath] of Object.entries(manifest.icons)) {
      const png = fs.readFileSync(new URL(`public/${relativePath}`, extensionRoot));
      assert.equal(png.readUInt32BE(16), Number(size));
      assert.equal(png.readUInt32BE(20), Number(size));
    }
  }
  for (const locale of ["ko", "en"]) {
    const messages = JSON.parse(fs.readFileSync(new URL(`public/_locales/${locale}/messages.json`, extensionRoot), "utf8"));
    assert.ok(messages.extensionName.message);
    assert.ok(messages.extensionDescription.message);
  }
});
