const {test,expect}=require("@playwright/test");
const {gotoApp}=require("./support/app-ready.js");
const CORS_HEADERS={"access-control-allow-origin":"*","access-control-allow-headers":"content-type, authorization, x-session-uuid","access-control-allow-methods":"GET, OPTIONS","content-type":"application/json"};
async function openMake(page, _messages, extra) {
  await page.addInitScript(extra=>{
    localStorage.clear();
    localStorage.setItem('ttalkak_access_token','fixture-token');
    localStorage.setItem('prompt_hub_web_state_v2',JSON.stringify({state:{...extra,route:'home',activeFolderId:'all',messages:[],makeFolders:[{id:'uncategorized',name:'미분류'}]}}));
  }, {isLoggedIn:extra.isLoggedIn,currentUser:extra.currentUser,currentUserId:extra.currentUserId,authToken:extra.authToken,token:extra.token,recentThreads:extra.recentThreads});
  const writes=[];
  await page.route('http://localhost:8080/**',async route=>{
    const request=route.request(),path=new URL(request.url()).pathname;
    if(!['GET','OPTIONS'].includes(request.method())) writes.push(path);
    if(request.method()==='OPTIONS') return route.fulfill({status:204,headers:CORS_HEADERS,body:''});
    if(path==='/api/make/threads/77') return extra.threadHandler(route);
    if(extra.makeHydrationHandler && ['/api/make/threads','/api/make/folders'].includes(path)) return extra.makeHydrationHandler(route,path);
    return route.fulfill({status:200,headers:CORS_HEADERS,body:JSON.stringify({items:path==='/api/make/threads'?extra.backendThreads:[]})});
  });
  await gotoApp(page);
  await page.locator('.sidebar [data-route="make"]').click();
  await expect(page.locator('.make-page')).toBeVisible();
  return writes;
}

for (const order of ['list-first','detail-first']) test(`real Make normalization preserves detail during ${order} hydration race`, async ({page}) => {
  let releaseList,releaseDetail,started;
  const list=new Promise(r=>{releaseList=r;});
  const detail=new Promise(r=>{releaseDetail=r;});
  const requested=new Promise(r=>{started=r;});
  const summary={id:77,title:'Race fixture',messages:[]};
  await openMake(page,[],{
    isLoggedIn:true,currentUser:'Fixture User',currentUserId:7,authToken:'fixture-token',token:'fixture-token',
    recentThreads:[summary],backendThreads:[summary],
    makeHydrationHandler:async(route,path)=>{
      if(path.endsWith('/threads')) await list;
      await route.fulfill({status:200,headers:CORS_HEADERS,body:JSON.stringify({items:path.endsWith('/threads')?[summary]:[]})});
    },
    threadHandler:async route=>{started();await detail;
      await route.fulfill({status:200,headers:CORS_HEADERS,body:JSON.stringify({...summary,messages:[{id:'race-user',role:'user',content:'Preserved race body'}]})});},
  });
  await page.locator('[data-open-thread="77"]').click();await requested;
  if(order==='list-first') {
    releaseList();await expect(page.getByText(/Make API 연결됨/)).toBeVisible();releaseDetail();
  } else {
    releaseDetail();await expect(page.getByText('Preserved race body',{exact:true})).toBeVisible();releaseList();
  }
  await expect(page.getByText(/Make API 연결됨/)).toBeVisible();
  await expect(page.getByText('Preserved race body',{exact:true})).toBeVisible();
});

test('a delayed detail response cannot navigate away from Home', async ({page})=>{
  let release,started;
  const detail=new Promise(r=>{release=r;});const requested=new Promise(r=>{started=r;});
  const summary={id:77,title:'Navigation fixture',messages:[]};
  await openMake(page,[],{isLoggedIn:true,currentUser:'Fixture User',currentUserId:7,
    authToken:'fixture-token',token:'fixture-token',recentThreads:[summary],backendThreads:[summary],
    threadHandler:async route=>{started();await detail;await route.fulfill({status:200,headers:CORS_HEADERS,body:JSON.stringify({...summary,messages:[{role:'user',content:'Late body'}]})});},
  });
  await expect(page.getByText(/Make API 연결됨/)).toBeVisible();
  await page.locator('[data-open-thread="77"]').click();await requested;
  await page.locator('.sidebar [data-route="home"]').click();
  const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/make/threads/77');release();
  const received=await response;await received.finished();
  await expect(page.locator('.home-page')).toBeVisible();
  await expect(page.locator('.make-page')).toHaveCount(0);
});
