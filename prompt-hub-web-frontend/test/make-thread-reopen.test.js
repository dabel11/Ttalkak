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
  return { state, flows, errors, ctx };
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


function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return {promise,resolve}; }
async function hydrationFixture() {
  const {backendEffects} = await import('../src/effects/backend-effects.mjs');
  const {state,flows,ctx} = await fixture(async () => null);
  Object.assign(ctx, {makePreview: String, applyMakeThreadsResult: backendEffects.applyMakeThreadsResult});
  return {state,flows,ctx,backendEffects};
}

test('same-thread new message invalidates a pending detail response', async () => {
  const d=deferred(); const {state,flows}=await fixture(()=>d.promise);
  const {api}=await import('../src/state/state-make.mjs');
  const opening=flows.openRecentThread('7');
  api.appendMakeUserMessageState(state,'7',{content:'new'});
  d.resolve({id:'7',messages:[{content:'old'}]}); await opening;
  assert.deepEqual(state.messages,[{content:'new'}]);
});

test('A B A reversed detail responses apply only the newest request', async () => {
  const a1=deferred(), b=deferred(), a2=deferred(); let reads=0;
  const {state,flows}=await fixture(id=>id==='8'?b.promise:++reads===1?a1.promise:a2.promise);
  state.recentThreads.push({id:'8',serverId:'8',messages:[]});
  const first=flows.openRecentThread('7'), middle=flows.openRecentThread('8'), last=flows.openRecentThread('7');
  a2.resolve({id:'7',messages:[{content:'newest'}]}); await last;
  b.resolve({id:'8',messages:[{content:'B'}]}); await middle;
  a1.resolve({id:'7',messages:[{content:'old A'}]}); await first;
  assert.deepEqual(state.messages,[{content:'newest'}]);
});

test('first Make hydration preserves detached saved history without adding a recent thread', async () => {
  const {state,ctx,backendEffects}=await hydrationFixture();
  const {api}=await import('../src/state/state-make.mjs');
  api.openSavedMakePromptState({state},'9',{messages:[{content:'saved'}]});
  state.makeBackendStatus='idle';
  const list=deferred();
  await Promise.resolve();
  const pending=backendEffects.hydrateBackendMakeDataEffect({...ctx,applyContext:()=>ctx,
    getMakeApi:()=>({getMakeThreads:()=>list.promise}),
    makeState:{...ctx.makeState,setMakeBackendState:(s,status)=>{s.makeBackendStatus=status;}}});
  list.resolve([{id:'7',messages:[]}]); await pending;
  assert.equal(state.activeThreadId,'saved-thread-9');
  assert.deepEqual(state.messages,[{content:'saved'}]);
  assert.equal(state.recentThreads.some(t=>t.id==='saved-thread-9'),false);
});

test('summary hydration after detail preserves full messages', async () => {
  const {state,ctx,backendEffects}=await hydrationFixture();
  const {api}=await import('../src/state/state-make.mjs');
  api.openRecentMakeThreadState(state,{id:'7',messages:[{content:'detail'}]});
  backendEffects.applyMakeThreadsResult(ctx,[{id:'7',messages:[]}]);
  assert.deepEqual(state.messages,[{content:'detail'}]);
});

test('summary hydration before detail does not invalidate the active detail request', async () => {
  const d=deferred(); const {state,flows,ctx}=await fixture(()=>d.promise);
  const {backendEffects}=await import('../src/effects/backend-effects.mjs');
  const opening=flows.openRecentThread('7');
  backendEffects.applyMakeThreadsResult({...ctx,makePreview:String},[{id:'7',messages:[]}]);
  d.resolve({id:'7',messages:[{content:'detail'}]}); await opening;
  assert.deepEqual(state.messages,[{content:'detail'}]);
});

test('editing same-thread content invalidates an older detail response', async () => {
  const d=deferred(); const {state,flows}=await fixture(()=>d.promise);
  state.recentThreads[0].messages=[{role:'user',content:'old'}];
  const {api}=await import('../src/state/state-make.mjs');
  const opening=flows.openRecentThread('7');
  api.applyEditedMakeMessageState(state,0,'edited',1);
  d.resolve({id:'7',messages:[{content:'old'}]}); await opening;
  assert.equal(state.messages[0].content,'edited');
});
