const test = require('node:test');
const assert = require('node:assert/strict');

async function fixture(getMakeThread, getMakeThreads) {
  const { createMakeRecentWorkflows } = await import('../src/make/make-recent-workflows.mjs');
  const { api } = await import('../src/state/state-make.mjs');
  const summary = { id: '7', serverId: '7', messages: [] };
  const state = { isLoggedIn: true, authToken:'fixture', recentThreads: [summary], messages: [] };
  const errors = [];
  let renders=0;
  const { makeServerSyncEffects } = await import('../src/effects/make-server-sync-effects.mjs');
  const ctx = { state, render() {renders++;}, getMakeApi: () => ({getMakeThread, getMakeThreads}), getMakeApiToken: () => state.authToken, hasBackendAuthToken: () => true, isBackendNumericId: id => /^\d+$/.test(String(id)), openRecentMakeThreadState: api.openRecentMakeThreadState, handleBackendAccessError: (e, text) => errors.push(text), makeState: { setMakeRecentThreads(s, threads) { s.recentThreads = threads; } }, normalizeRecentThreads() {} };
  const {backendEffects}=await import('../src/effects/backend-effects.mjs');
  Object.assign(ctx,{applyMakeThreadsResult:backendEffects.applyMakeThreadsResult,getBackendDataEffectContext:()=>ctx,makePreview:String});
  const effects = makeServerSyncEffects.createMakeServerSyncEffects(ctx);
  const flows = createMakeRecentWorkflows({...ctx, refreshActiveMakeThreadFromBackend: effects.refreshActiveMakeThreadFromBackend});
  return { state, flows, errors, ctx, effects, rendered:()=>renders };
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

test('leaving Make while detail loads must not navigate back', async () => {
  const d=deferred(); const {state,flows}=await fixture(()=>d.promise);
  const opening=flows.openRecentThread('7'); state.route='home';
  d.resolve({id:'7',messages:[{content:'late'}]}); await opening;
  assert.equal(state.route,'home'); assert.deepEqual(state.messages,[]);
});

test('real list normalization before detail does not discard the detail response', async () => {
  const d=deferred(); const {state,flows,ctx}=await fixture(()=>d.promise);
  const {backendEffects}=await import('../src/effects/backend-effects.mjs');
  const model=await import('../src/utils/make-message-model.mjs');
  const {normalizeAndPersistMakeState}=await import('../src/make/make-persistence.mjs');
  const {makeState}=await import('../src/make/make-state.mjs');
  const opening=flows.openRecentThread('7');
  backendEffects.applyMakeThreadsResult({...ctx,makePreview:String,
    normalizeRecentThreads:()=>normalizeAndPersistMakeState(state,model,makeState,()=>{})},[{id:'7',messages:[]}]);
  d.resolve({id:'7',messages:[{role:'user',content:'detail'}]}); await opening;
  assert.equal(state.messages[0]?.content,'detail');
});

test('an invalidated failure recovery does not restore the previous conversation snapshot', async () => {
  const d=deferred(); const state={messages:[{content:'A'}],activeThreadId:'7'};
  const {makeFailureRecoveryEffects}=await import('../src/effects/make-failure-recovery-effects.mjs');
  const pending=makeFailureRecoveryEffects.recoverActiveMakeThreadAfterFailure({state,
    shouldUseImproveThreadSync:()=>true,getMakeBackendThreadId:()=> '7',
    refreshActiveMakeThreadFromBackend:()=>d.promise}, {threadId:'7',prompt:'A',localMessagesSnapshot:state.messages});
  state.activeThreadId='8';state.messages=[{content:'B'}];d.resolve(null);await pending;
  assert.deepEqual(state.messages,[{content:'B'}]);
});

test('newer list refresh wins when list responses arrive in reverse order', async () => {
  const old=deferred(), latest=deferred();let reads=0;
  const {state,effects}=await fixture(null,()=>++reads===1?old.promise:latest.promise);
  const first=effects.refreshMakeThreadsFromBackend(), second=effects.refreshMakeThreadsFromBackend();
  latest.resolve([{id:'8',title:'newest'}]);await second;
  old.resolve([{id:'7',title:'old'}]);await first;
  assert.deepEqual(state.recentThreads.map(t=>t.id),['8']);
});

test('detail response from a previous login cannot populate the new session', async () => {
  const d=deferred();const {state,flows}=await fixture(()=>d.promise);
  const pending=flows.openRecentThread('7');state.authToken='new-session';
  d.resolve({id:'7',messages:[{content:'old account'}]});await pending;
  assert.deepEqual(state.messages,[]);
});

test('list response from a previous login cannot populate the new session', async () => {
  const d=deferred();const {state,effects}=await fixture(null,()=>d.promise);
  const pending=effects.refreshMakeThreadsFromBackend();state.authToken='new-session';state.recentThreads=[];
  d.resolve([{id:'7',title:'old account'}]);await pending;
  assert.deepEqual(state.recentThreads,[]);
});

test('deleting an inactive conversation invalidates the earlier list response', async () => {
  const d=deferred();const {state,effects}=await fixture(null,()=>d.promise);
  const {api}=await import('../src/state/state-make.mjs');
  const pending=effects.refreshMakeThreadsFromBackend();api.deleteMakeThreadState(state,'7');
  d.resolve([{id:'7'}]);await pending;assert.deepEqual(state.recentThreads,[]);
});

test('hydration from an old session cannot restore conversations or folders', async () => {
  const d=deferred();const {state,ctx,backendEffects}=await hydrationFixture();
  Object.assign(state,{route:'make',makeBackendStatus:'idle',makeFolders:[]});
  const pending=backendEffects.hydrateBackendMakeDataEffect({...ctx,applyContext:()=>ctx,
    getMakeApi:()=>({getMakeThreads:()=>d.promise,getMakeFolders:async()=>[{id:'9',name:'old account'}]}),
    makeState:{...ctx.makeState,setMakeBackendState:(s,status)=>{s.makeBackendStatus=status;}}});
  state.authToken='new-session';state.recentThreads=[];state.makeBackendStatus='idle';
  d.resolve([{id:'7'}]);await pending;
  assert.deepEqual(state.recentThreads,[]);assert.deepEqual(state.makeFolders,[]);assert.equal(state.makeBackendStatus,'idle');
});

test('a newer explicit list refresh supersedes an earlier initial hydration', async () => {
  const old=deferred(),latest=deferred();let reads=0;
  const {state,ctx,effects}=await fixture(null,()=>++reads===1?old.promise:latest.promise);
  const {backendEffects}=await import('../src/effects/backend-effects.mjs');
  Object.assign(state,{route:'make',makeBackendStatus:'idle'});
  const first=backendEffects.hydrateBackendMakeDataEffect({...ctx,applyContext:()=>ctx,
    makeState:{...ctx.makeState,setMakeBackendState:(s,status)=>{s.makeBackendStatus=status;}}});
  const second=effects.refreshMakeThreadsFromBackend();latest.resolve([{id:'8'}]);await second;
  old.resolve([{id:'7'}]);await first;
  assert.deepEqual(state.recentThreads.map(t=>t.id),['8']);
});

for (const outcome of ['success','error']) test(`AI ${outcome} after switching conversations cannot alter the new conversation`, async () => {
  const {resendEdited}=await import('../src/make/make-controller.mjs');
  const {api}=await import('../src/state/state-make.mjs');
  const d=deferred(),called=deferred();let stopped=0;
  const state={route:'make',activeThreadId:'local-A',messages:[{id:'u',role:'user',content:'A'}]};
  const ctx={state,findEditableMessage:()=>0,guard:()=>false,isBusy:()=>false,
    getActiveThreadId:()=>state.activeThreadId,getMessages:()=>state.messages,shouldSync:()=>false,
    buildHistory:()=>[],startRequest:()=>new AbortController().signal,
    applyEdit:(i,v,n)=>api.applyEditedMakeMessageState(state,i,v,n),setThinking:()=>{},queueScroll:()=>{},render:()=>{},waitForPaint:async()=>{},
    improve:async()=>{called.resolve();const value=await d.promise;if(outcome==='error') throw Error('late');return value;},
    finishEdit:()=>{throw Error('must not append to B');},classifyError:()=>{throw Error('must not mark B failed');},stopInFlight:()=>{stopped++;}};
  const pending=resendEdited(ctx,'u','edited A');await called.promise;
  api.openRecentMakeThreadState(state,{id:'local-B',messages:[{content:'B'}]});
  d.resolve({text:'late A'});await pending;
  assert.deepEqual(state.messages,[{content:'B'}]);assert.equal(stopped,1);
});

test('a missing detail and missing list entry clear the cached conversation and render', async () => {
  const {state,effects,rendered}=await fixture(async()=>{throw Object.assign(Error('missing'),{status:404});},async()=>[]);
  state.activeThreadId='7';state.route='make';state.messages=[{content:'deleted'}];
  await effects.refreshActiveMakeThreadFromBackend('7');
  assert.equal(state.activeThreadId,null);assert.deepEqual(state.messages,[]);assert.equal(rendered(),1);
});

test('a failed concurrency refresh after a conversation switch does not append to the new conversation', async () => {
  const {handleThreadConcurrency}=await import('../src/make/make-controller.mjs');
  const {api}=await import('../src/state/state-make.mjs');
  const d=deferred(),state={route:'make',activeThreadId:'7',messages:[{content:'A'}]};
  const pending=handleThreadConcurrency({state,classifyError:()=>({}),refreshThread:()=>d.promise,
    setThinking:()=>{},appendUser:()=>{throw Error('must not append to B');}},
    {error:{status:409,code:'THREAD_CONCURRENTLY_UPDATED'},threadId:'7',prompt:'A'});
  api.openRecentMakeThreadState(state,{id:'8',messages:[{content:'B'}]});d.resolve(null);
  assert.equal(await pending,true);assert.deepEqual(state.messages,[{content:'B'}]);
});

test('user interaction during initial hydration does not leave connection status stuck at checking', async () => {
  const {state,ctx,backendEffects}=await hydrationFixture();let interaction=0;
  Object.assign(state,{route:'make',makeBackendStatus:'idle'});const d=deferred();
  const pending=backendEffects.hydrateBackendMakeDataEffect({...ctx,applyContext:()=>ctx,
    getMakeInteractionVersion:()=>interaction,getMakeApi:()=>({getMakeThreads:()=>d.promise}),
    makeState:{...ctx.makeState,setMakeBackendState:(s,status)=>{s.makeBackendStatus=status;}}});
  interaction++;d.resolve([{id:'8'}]);await pending;
  assert.equal(state.makeBackendStatus,'connected');assert.deepEqual(state.recentThreads.map(t=>t.id),['7']);
});

test('an explicit refresh for an inactive conversation must not open that conversation', async () => {
  let reads=0;const {state,effects}=await fixture(async()=>{reads++;return {id:'7',messages:[]};});
  state.activeThreadId='8';state.messages=[{content:'B'}];
  await effects.refreshActiveMakeThreadFromBackend('7');assert.equal(reads,0);assert.equal(state.activeThreadId,'8');
});

test('entering message edit while detail loads preserves the editing view', async () => {
  const d=deferred();const {state,flows}=await fixture(()=>d.promise);
  state.recentThreads[0].messages=[{id:'u',role:'user',content:'cached'}];
  const pending=flows.openRecentThread('7');state.editingMessageId='u';
  d.resolve({id:'7',messages:[{id:'u',role:'user',content:'server'}]});await pending;
  assert.equal(state.editingMessageId,'u');assert.equal(state.messages[0].content,'cached');
});

for (const outcome of ['success','error']) test(`AI sync ${outcome} from an old login must not mutate the new session`, async () => {
  const {makeServerSyncEffects}=await import('../src/effects/make-server-sync-effects.mjs');
  const d=deferred(),state={isLoggedIn:true,authToken:'old',recentThreads:[{id:'7'}]};
  const effects=makeServerSyncEffects.createMakeServerSyncEffects({state,
    getMakeApi:()=>({improvePrompt:async()=>{const result=await d.promise;if(outcome==='error')throw Error('old error');return result;}}),
    getMakeApiToken:()=>state.authToken,hasBackendAuthToken:()=>true,isBackendNumericId:id=>/^\d+$/.test(id),
    makeState:{setMakeBackendState:()=>{throw Error('must not change new session status');}}});
  const pending=effects.improvePromptWithBackend('test',{history:[],threadId:'7'});
  state.authToken='new';d.resolve({threadId:'9',text:'old result'});
  await assert.rejects(pending,{code:'REQUEST_ABORTED'});
  assert.equal(state.pendingMakeImproveThread,undefined);assert.equal(state.recentThreads[0].serverId,undefined);
});

test('switching conversations before the paint delay completes avoids the AI request', async () => {
  const {resendEdited}=await import('../src/make/make-controller.mjs');
  const {api}=await import('../src/state/state-make.mjs');const paint=deferred();
  const state={route:'make',activeThreadId:'local-A',messages:[{id:'u',role:'user',content:'A'}]};
  const pending=resendEdited({state,findEditableMessage:()=>0,guard:()=>false,isBusy:()=>false,
    getActiveThreadId:()=>state.activeThreadId,getMessages:()=>state.messages,shouldSync:()=>false,
    buildHistory:()=>[],startRequest:()=>new AbortController().signal,
    applyEdit:(i,v,n)=>api.applyEditedMakeMessageState(state,i,v,n),setThinking:()=>{},queueScroll:()=>{},render:()=>{},
    waitForPaint:()=>paint.promise,improve:()=>{throw Error('must not call AI after switching');},stopInFlight:()=>{}},'u','edited A');
  api.openRecentMakeThreadState(state,{id:'local-B',messages:[{content:'B'}]});paint.resolve();await pending;
  assert.deepEqual(state.messages,[{content:'B'}]);
});

test('initial hydration can fill an empty active cache from a complete server list response', async () => {
  const {state,ctx,backendEffects}=await hydrationFixture();
  state.activeThreadId='7';state.messages=[];
  backendEffects.applyMakeThreadsResult(ctx,[{id:'7',messages:[{role:'user',content:'server body'}]}]);
  assert.equal(state.messages[0]?.content,'server body');
});

test('absence from a paginated list does not discard the active cached conversation', async () => {
  const {state,ctx,backendEffects}=await hydrationFixture();state.activeThreadId='7';state.messages=[{role:'user',content:'older active body'}];
  backendEffects.applyMakeThreadsResult(ctx,[{id:'8',messages:[]}]);
  assert.equal(state.activeThreadId,'7');assert.equal(state.messages[0].content,'older active body');
  assert.equal(state.recentThreads.some(t=>t.id==='7'),true);
});

test('a confirmed 404 cannot revive the conversation through a stale list response', async () => {
  let listReads=0;
  const {state,effects}=await fixture(async()=>{throw Object.assign(Error('missing'),{status:404});},async()=>{listReads++;return [{id:'7'}];});
  state.activeThreadId='7';state.messages=[{content:'cached'}];
  await effects.refreshActiveMakeThreadFromBackend('7');
  assert.equal(listReads,0);assert.equal(state.activeThreadId,null);assert.deepEqual(state.recentThreads,[]);
});

test('an invalidated backend-edit conflict recovery cannot close the new conversation edit form', async () => {
  const {resendEdited}=await import('../src/make/make-controller.mjs');
  const {api}=await import('../src/state/state-make.mjs');
  const d=deferred(),started=deferred();
  const state={route:'make',authToken:'fixture',activeThreadId:'7',recentThreads:[{id:'7'}],editingMessageId:'uA',messages:[{id:'uA',role:'user',content:'A'}]};
  const ctx={state,findEditableMessage:()=>0,guard:()=>false,isBusy:()=>false,
    getActiveThreadId:()=>state.activeThreadId,getMessages:()=>state.messages,shouldSync:()=>true,getBackendThreadId:()=> '7',
    buildHistory:()=>[],startRequest:()=>new AbortController().signal,
    updateThread:id=>api.updateRecentMakeThreadState({state,makePreview:String,makePromptTitle:String},id),setThinking:()=>{},queueScroll:()=>{},render:()=>{},
    improve:async()=>{throw {status:409,code:'THREAD_CONCURRENTLY_UPDATED'};},classifyError:()=>({}),
    refreshThread:()=>{started.resolve();return d.promise;},clearEditing:()=>{state.editingMessageId=null;},stopInFlight:()=>{}};
  const pending=resendEdited(ctx,'uA','edited A');await started.promise;
  api.openRecentMakeThreadState(state,{id:'8',messages:[{content:'B'}]});state.editingMessageId='uB';d.resolve(null);await pending;
  assert.equal(state.editingMessageId,'uB');assert.deepEqual(state.messages,[{content:'B'}]);
});
