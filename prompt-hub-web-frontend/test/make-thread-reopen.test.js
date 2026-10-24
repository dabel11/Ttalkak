const test = require('node:test');
const assert = require('node:assert/strict');

async function fixture(getMakeThread, getMakeThreads) {
  const { createMakeRecentWorkflows } = await import('../src/make/make-recent-workflows.mjs');
  const { api } = await import('../src/state/state-make.mjs');
  const summary = { id: '7', serverId: '7', messages: [] };
  const state = { isLoggedIn: true, recentThreads: [summary], messages: [] };
  const errors = [];
  const { makeServerSyncEffects } = await import('../src/effects/make-server-sync-effects.mjs');
  const ctx = { state, render() {}, getMakeApi: () => ({getMakeThread, getMakeThreads}), getMakeApiToken: () => 'fixture', hasBackendAuthToken: () => true, isBackendNumericId: id => /^\d+$/.test(String(id)), openRecentMakeThreadState: api.openRecentMakeThreadState, handleBackendAccessError: (e, text) => errors.push(text), makeState: { setMakeRecentThreads(s, threads) { s.recentThreads = threads; } }, normalizeRecentThreads() {} };
  const effects = makeServerSyncEffects.createMakeServerSyncEffects(ctx);
  const flows = createMakeRecentWorkflows({...ctx, refreshActiveMakeThreadFromBackend: effects.refreshActiveMakeThreadFromBackend});
  return { state, flows, errors };
}

test('reopening a server summary loads its messages without creating a thread', async () => {
  const detail = { id: '7', serverId: '7', messages: [{id:'m1',role:'user',content:'fixture'}] };
  const {state, flows} = await fixture(async id => { assert.equal(id,'7'); return detail; });
  await flows.openRecentThread('7');
  assert.deepEqual(state.messages, detail.messages);
  assert.equal(state.recentThreads.length, 1);
});

test('late thread response cannot replace a different active conversation', async () => {
  let resolve;
  const pending = new Promise(r => { resolve = r; });
  const {state, flows} = await fixture(() => pending);
  const opening = flows.openRecentThread('7');
  state.activeThreadId = 'other'; state.messages = [{content:'other'}];
  resolve({id:'7',messages:[{content:'late'}]});
  await opening;
  assert.deepEqual(state.messages,[{content:'other'}]);
});

test('failed detail request keeps cached messages and reports failure', async () => {
  const {state, flows, errors} = await fixture(async () => { throw Error('offline'); });
  state.recentThreads[0].messages = [{content:'cached'}];
  await flows.openRecentThread('7');
  assert.deepEqual(state.messages,[{content:'cached'}]);
  assert.equal(errors.length,1);
});

test('opening saved history repeatedly does not add synthetic recent threads', async () => {
  const {api} = await import('../src/state/state-make.mjs');
  const state = {recentThreads:[{id:'7'}]};
  const prompt = {messages:[{id:'m1',content:'saved'}]};
  const ctx = {state, updateRecentThread() { throw Error('must not create a thread'); }};
  api.openSavedMakePromptState(ctx,'9',prompt);
  api.openSavedMakePromptState(ctx,'9',prompt);
  assert.deepEqual(state.recentThreads,[{id:'7'}]);
  assert.deepEqual(state.messages,prompt.messages);
  assert.notEqual(state.messages[0],prompt.messages[0]);
});


test('malformed detail identity cannot overwrite cached conversation', async () => {
  const {state, flows, errors} = await fixture(async () => ({id:'backend-thread-0', messages:[]}));
  state.recentThreads[0].messages = [{content:'cached'}];
  await flows.openRecentThread('7');
  assert.deepEqual(state.messages,[{content:'cached'}]);
  assert.equal(errors.length,1);
});


test('detail failure does not replace cached messages with summary-only list refresh', async () => {
  let listReads = 0;
  const {state, flows} = await fixture(async () => { throw Error('offline'); }, async () => {
    listReads++;
    return [{id:'7',serverId:'7',messages:[]}];
  });
  state.recentThreads[0].messages = [{content:'cached'}];
  await flows.openRecentThread('7');
  assert.equal(listReads,0);
  assert.deepEqual(state.messages,[{content:'cached'}]);
});
