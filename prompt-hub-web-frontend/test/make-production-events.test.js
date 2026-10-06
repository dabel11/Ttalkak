const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const terser = require('terser');

// Use the real production property allowlist and the real delegated click handler.
test('production compression preserves the DOM recent-thread ID', async () => {
  const build = fs.readFileSync(path.join(__dirname, '../../scripts/build-web.cjs'), 'utf8');
  const policy = build.slice(build.indexOf('const internalContextPropertyPattern'), build.indexOf('async function compressProductionJavaScript'));
  const regex = vm.runInNewContext(`${policy}\nproductionManglePropertyPattern`);
  const events = fs.readFileSync(path.join(__dirname, '../src/make/make-events.mjs'), 'utf8');
  const source = `${events}\nexport function exercise() {
    let opened = null;
    const target = {dataset: JSON.parse('{"openThread":"17"}'), closest() {return this;}};
    const handlers = createDelegatedMakeHandlers({state: {}, actions: {openThread(id) {opened = id;}}});
    handlers.click({target});
    return opened;
  }`;
  const result = await terser.minify(source, {
    module: true,
    compress: {passes: 10, pure_getters: true, unsafe: true},
    mangle: {properties: {keep_quoted: 'strict', regex}},
  });
  const compressed = await import(`data:text/javascript;base64,${Buffer.from(result.code).toString('base64')}`);
  assert.equal(compressed.exercise(), '17');
});
