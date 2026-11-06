import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const source=readFileSync(new URL('./clientData.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const endpoint='http://localhost:3001/v1/inventory';

function setup(fetcher,{getSession=()=>null,schedule=setTimeout,apiUrl}={}){
  const browser={fetch:fetcher,dispatchEvent(){},setTimeout:schedule};
  const exports={};
  const context=vm.createContext({exports,window:browser,fetch:(...args)=>browser.fetch(...args),sessionStorage:{getItem:getSession},process:{env:apiUrl?{NEXT_PUBLIC_API_URL:apiUrl}:{}},Headers,Request,Response,URL,CustomEvent:class{constructor(type,init){this.type=type;this.detail=init?.detail}}});
  vm.runInContext(js,context);
  exports.installFastFetchCache();
  browser.prefetchGameData=exports.prefetchGameData;
  return browser;
}

test('concurrent mutations with different bearer tokens never share a response',async()=>{
  let calls=0;
  const browser=setup(async(_input,init)=>{calls++;return new Response(new Headers(init.headers).get('authorization'))});
  const [a,b]=await Promise.all([
    browser.fetch(endpoint,{method:'POST',headers:{authorization:'Bearer A'},body:'{"action":"collect"}'}),
    browser.fetch(endpoint,{method:'POST',headers:{authorization:'Bearer B'},body:'{"action":"collect"}'})
  ]);
  assert.equal(await a.text(),'Bearer A');
  assert.equal(await b.text(),'Bearer B');
  assert.equal(calls,2);
});

test('GET Request objects with different credentials never share cache',async()=>{
  let calls=0;
  const browser=setup(async(input)=>{calls++;return new Response(input.headers.get('authorization'))});
  const a=await browser.fetch(new Request(endpoint,{headers:{authorization:'Bearer A'}}));
  const b=await browser.fetch(new Request(endpoint,{headers:{authorization:'Bearer B'}}));
  assert.equal(await a.text(),'Bearer A');
  assert.equal(await b.text(),'Bearer B');
  assert.equal(calls,2);
});

test('in-flight GET before a mutation cannot repopulate stale cache',async()=>{
  let calls=0,release;
  const browser=setup(async(_input,init)=>{
    calls++;
    if((init?.method??'GET')==='GET'&&calls===1)return await new Promise(resolve=>{release=resolve});
    return new Response('fresh');
  });
  const old=browser.fetch(endpoint);
  await browser.fetch(endpoint,{method:'POST',body:'{}'});
  release(new Response('stale'));
  assert.equal(await (await old).text(),'stale');
  assert.equal(await (await browser.fetch(endpoint)).text(),'fresh');
  assert.equal(calls,3);
});

test('identical concurrent string-body mutations still deduplicate',async()=>{
  let calls=0;
  const browser=setup(async()=>{calls++;await new Promise(resolve=>setTimeout(resolve,5));return new Response('ok')});
  const [a,b]=await Promise.all([
    browser.fetch(endpoint,{method:'POST',headers:{authorization:'Bearer A'},body:'{"action":1}'}),
    browser.fetch(endpoint,{method:'POST',headers:{authorization:'Bearer A'},body:'{"action":1}'})
  ]);
  assert.equal(await a.text(),'ok');assert.equal(await b.text(),'ok');assert.equal(calls,1);
});

test('non-string mutation bodies are not incorrectly coalesced',async()=>{
  let calls=0;
  const browser=setup(async()=>{calls++;return new Response('ok')});
  await Promise.all([
    browser.fetch(endpoint,{method:'POST',body:new URLSearchParams('a=1')}),
    browser.fetch(endpoint,{method:'POST',body:new URLSearchParams('a=2')})
  ]);
  assert.equal(calls,2);
});

test('old in-flight GET does not remove a newer pending GET after mutation',async()=>{
  let calls=0,releaseFirst,releaseSecond;
  const browser=setup(async(_input,init)=>{
    calls++;
    if(init?.method==='POST')return new Response('mutated');
    if(calls===1)return new Promise(resolve=>{releaseFirst=resolve});
    if(calls===3)return new Promise(resolve=>{releaseSecond=resolve});
    return new Response('unexpected');
  });
  const first=browser.fetch(endpoint);
  await browser.fetch(endpoint,{method:'POST',body:'{}'});
  const second=browser.fetch(endpoint);
  releaseFirst(new Response('old'));
  await first;
  const third=browser.fetch(endpoint);
  releaseSecond(new Response('new'));
  assert.equal(await (await second).text(),'new');
  assert.equal(await (await third).text(),'new');
  assert.equal(calls,3);
});

test('GET cached during an unfinished mutation is invalidated when the mutation settles',async()=>{
  let calls=0,finishMutation;
  let version='before';
  const browser=setup(async(_input,init)=>{
    calls++;
    if(init?.method==='POST')return new Promise(resolve=>{
      finishMutation=()=>{version='after';resolve(new Response('saved'))};
    });
    return new Response(version);
  });
  const mutation=browser.fetch(endpoint,{method:'POST',body:'{}'});
  assert.equal(await (await browser.fetch(endpoint)).text(),'before');
  finishMutation();
  await mutation;
  assert.equal(await (await browser.fetch(endpoint)).text(),'after');
  assert.equal(calls,3);
});

test('GET still in flight when a mutation settles cannot repopulate stale cache',async()=>{
  let calls=0,finishMutation,finishOldRead;
  const browser=setup(async(_input,init)=>{
    calls++;
    if(init?.method==='POST')return new Promise(resolve=>{finishMutation=()=>resolve(new Response('saved'))});
    if(calls===2)return new Promise(resolve=>{finishOldRead=()=>resolve(new Response('old'))});
    return new Response('new');
  });
  const mutation=browser.fetch(endpoint,{method:'POST',body:'{}'});
  const staleRead=browser.fetch(endpoint);
  finishMutation();
  await mutation;
  finishOldRead();
  assert.equal(await (await staleRead).text(),'old');
  assert.equal(await (await browser.fetch(endpoint)).text(),'new');
  assert.equal(calls,3);
});


test('bodyless mutation statuses 204 and 205 remain valid Responses',async()=>{
  for(const status of [204,205]){
    const browser=setup(async()=>new Response(null,{status}));
    const response=await browser.fetch(endpoint,{method:'DELETE',body:'{}'});
    assert.equal(response.status,status);
    assert.equal(await response.text(),'');
  }
});

test('304 GET responses preserve their bodyless status',async()=>{
  const browser=setup(async()=>new Response(null,{status:304}));
  const response=await browser.fetch(endpoint);
  assert.equal(response.status,304);
  assert.equal(await response.text(),'');
});


test('signaled GET does not share a pending request and can abort independently',async()=>{
  let calls=0,finishFirst;
  const browser=setup((_input,init)=>{
    calls++;
    if(!init?.signal)return new Promise(resolve=>{finishFirst=resolve});
    return new Promise((_resolve,reject)=>{
      init.signal.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'})),{once:true});
    });
  });
  const first=browser.fetch(endpoint);
  const controller=new AbortController();
  const second=browser.fetch(endpoint,{signal:controller.signal});
  controller.abort();
  await assert.rejects(second,{name:'AbortError'});
  finishFirst(new Response('ok'));
  assert.equal(await (await first).text(),'ok');
  assert.equal(calls,2);
});

test('abortable identical mutations are never coalesced',async()=>{
  let calls=0;
  const browser=setup((_input,init)=>new Promise((resolve,reject)=>{
    calls++;
    init.signal?.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'})),{once:true});
    setTimeout(()=>resolve(new Response('saved')),10);
  }));
  const firstSignal=new AbortController(),secondSignal=new AbortController();
  const first=browser.fetch(endpoint,{method:'POST',body:'{}',signal:firstSignal.signal});
  const second=browser.fetch(endpoint,{method:'POST',body:'{}',signal:secondSignal.signal});
  firstSignal.abort();
  await assert.rejects(first,{name:'AbortError'});
  assert.equal(await (await second).text(),'saved');
  assert.equal(calls,2);
});

test('GET cache:no-store bypasses a previous cached response',async()=>{
  let calls=0;
  const browser=setup(async()=>new Response(String(++calls)));
  assert.equal(await (await browser.fetch(endpoint)).text(),'1');
  assert.equal(await (await browser.fetch(endpoint,{cache:'no-store'})).text(),'2');
  assert.equal(calls,2);
});

test('signaled GET bypasses an existing cached response',async()=>{
  let calls=0;
  const browser=setup(async()=>new Response(String(++calls)));
  assert.equal(await (await browser.fetch(endpoint)).text(),'1');
  assert.equal(await (await browser.fetch(endpoint,{signal:new AbortController().signal})).text(),'2');
  assert.equal(calls,2);
});


test('delayed prefetch does not replay an expired session after logout',async()=>{
  let session='Bearer-A',calls=0;
  const timers=[];
  const browser=setup(async()=>{calls++;return new Response('ok')},{
    getSession:()=>session,
    schedule:callback=>{timers.push(callback);return timers.length}
  });
  browser.prefetchGameData();
  assert.equal(timers.length,4);
  session=null;
  for(const callback of timers)callback();
  await Promise.resolve();
  assert.equal(calls,0);
});

test('prefetch after account switch uses only the current session',async()=>{
  let session='A';
  const timers=[],seen=[];
  const browser=setup(async(_input,init)=>{
    seen.push(new Headers(init.headers).get('authorization'));
    return new Response('ok');
  },{
    getSession:()=>session,
    schedule:callback=>{timers.push(callback);return timers.length}
  });
  browser.prefetchGameData();
  session='B';
  browser.prefetchGameData();
  assert.equal(timers.length,8);
  for(const callback of timers)callback();
  await Promise.resolve();
  assert.equal(seen.length,12);
  assert.deepEqual([...new Set(seen)],['Bearer B']);
});

test('prefetch stops the current batch if the session changes mid-flight',async()=>{
  let session='A',calls=0;
  const timers=[];
  const browser=setup(async()=>{
    calls++;
    session='B';
    return new Response('ok');
  },{
    getSession:()=>session,
    schedule:callback=>{timers.push(callback);return timers.length}
  });
  browser.prefetchGameData();
  timers[0]();
  await Promise.resolve();
  assert.equal(calls,1);
});


test('explicit credential modes bypass the GET cache and preserve native fetch options',async()=>{
  let calls=0;
  const browser=setup(async(_input,init)=>new Response(`${++calls}:${init?.credentials??'default'}`));
  assert.equal(await (await browser.fetch(endpoint)).text(),'1:default');
  assert.equal(await (await browser.fetch(endpoint,{credentials:'include'})).text(),'2:include');
  assert.equal(await (await browser.fetch(endpoint,{credentials:'omit'})).text(),'3:omit');
  assert.equal(await (await browser.fetch(endpoint)).text(),'1:default');
  assert.equal(calls,3);
});

test('identical mutations with explicit credential modes remain independent',async()=>{
  let calls=0;
  const browser=setup(async(_input,init)=>{
    const call=++calls;
    await Promise.resolve();
    return new Response(`${call}:${init.credentials}`);
  });
  const [a,b,c]=await Promise.all([
    browser.fetch(endpoint,{method:'POST',body:'{}',credentials:'include'}),
    browser.fetch(endpoint,{method:'POST',body:'{}',credentials:'omit'}),
    browser.fetch(endpoint,{method:'POST',body:'{}',credentials:'include'})
  ]);
  assert.deepEqual([await a.text(),await b.text(),await c.text()],['1:include','2:omit','3:include']);
  assert.equal(calls,3);
});


test('cached GETs are isolated across login, account switch, and logout without explicit headers',async()=>{
  let session='A',calls=0;
  const browser=setup(async()=>new Response(`${session}:${++calls}`),{getSession:()=>session});
  assert.equal(await (await browser.fetch(endpoint)).text(),'A:1');
  assert.equal(await (await browser.fetch(endpoint)).text(),'A:1');
  session='B';
  assert.equal(await (await browser.fetch(endpoint)).text(),'B:2');
  session=null;
  assert.equal(await (await browser.fetch(endpoint)).text(),'null:3');
  assert.equal(calls,3);
});

test('an in-flight GET from an old session cannot populate the new session cache',async()=>{
  let session='A',calls=0,releaseOld;
  const browser=setup(async()=>{
    calls++;
    if(calls===1)return new Promise(resolve=>{releaseOld=resolve});
    return new Response('new-session');
  },{getSession:()=>session});
  const old=browser.fetch(endpoint);
  session='B';
  const fresh=browser.fetch(endpoint);
  releaseOld(new Response('old-session'));
  assert.equal(await (await old).text(),'old-session');
  assert.equal(await (await fresh).text(),'new-session');
  assert.equal(await (await browser.fetch(endpoint)).text(),'new-session');
  assert.equal(calls,2);
});

test('identical pending mutations are not deduplicated across account switches',async()=>{
  let session='A',calls=0,releaseOld;
  const browser=setup(async()=>{
    calls++;
    if(calls===1)return new Promise(resolve=>{releaseOld=resolve});
    return new Response('new-account');
  },{getSession:()=>session});
  const old=browser.fetch(endpoint,{method:'POST',body:'{}'});
  session='B';
  const fresh=browser.fetch(endpoint,{method:'POST',body:'{}'});
  releaseOld(new Response('old-account'));
  assert.equal(await (await old).text(),'old-account');
  assert.equal(await (await fresh).text(),'new-account');
  assert.equal(calls,2);
});


test('lookalike URL authority does not enter the API response cache',async()=>{
  let calls=0;
  const browser=setup(async()=>new Response(String(++calls)));
  // The original startsWith(apiUrl) check incorrectly accepted this userinfo URL.
  const lookalike='http://localhost:3001@outside.example/v1/inventory';
  assert.equal(await (await browser.fetch(lookalike)).text(),'1');
  assert.equal(await (await browser.fetch(lookalike)).text(),'2');
  assert.equal(calls,2);
});

test('unrelated same-origin paths containing /v1/ bypass the API cache',async()=>{
  let calls=0;
  const browser=setup(async()=>new Response(String(++calls)));
  const other='http://localhost:3001/other/v1/inventory';
  assert.equal(await (await browser.fetch(other)).text(),'1');
  assert.equal(await (await browser.fetch(other)).text(),'2');
  assert.equal(calls,2);
});

test('prefetch normalizes trailing slashes in the configured API URL',async()=>{
  const seen=[],timers=[];
  const browser=setup(async(input)=>{
    seen.push(String(input));
    return new Response('ok');
  },{
    apiUrl:'https://api.example.test/game/',
    getSession:()=> 'A',
    schedule:callback=>{timers.push(callback);return timers.length}
  });
  browser.prefetchGameData();
  for(const callback of timers)callback();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(seen.length,12);
  assert.ok(seen.every(url=>url.startsWith('https://api.example.test/game/v1/')));
  assert.ok(seen.every(url=>!url.includes('/game//v1/')));
});


test('206 Partial Content is never reused as a full GET response',async()=>{
  let calls=0;
  const browser=setup(async()=>{
    calls++;
    return calls===1
      ?new Response('part',{status:206,headers:{'content-range':'bytes 0-3/8'}})
      :new Response('complete',{status:200});
  });
  assert.equal((await browser.fetch(endpoint)).status,206);
  assert.equal(await (await browser.fetch(endpoint)).text(),'complete');
  assert.equal(calls,2);
});


test('GET responses marked private, no-store, or no-cache are never cached',async()=>{
  for(const directive of ['private','no-store','no-cache']){
    let calls=0;
    const browser=setup(async()=>new Response(String(++calls),{headers:{'cache-control':directive}}));
    assert.equal(await (await browser.fetch(endpoint)).text(),'1');
    assert.equal(await (await browser.fetch(endpoint)).text(),'2');
    assert.equal(calls,2);
  }
});


test('GET responses with Cache-Control max-age=0 are not cached',async()=>{
  for(const directive of ['max-age=0','public, max-age=0','max-age="0"']){
    let calls=0;
    const browser=setup(async()=>new Response(String(++calls),{headers:{'cache-control':directive}}));
    assert.equal(await (await browser.fetch(endpoint)).text(),'1');
    assert.equal(await (await browser.fetch(endpoint)).text(),'2');
    assert.equal(calls,2);
  }
});


test('GET responses with max-age shorter than the local TTL are not reused',async()=>{
  for(const directive of ['max-age=1','public, max-age=30','max-age="44"']){
    let calls=0;
    const browser=setup(async()=>new Response(String(++calls),{headers:{'cache-control':directive}}));
    assert.equal(await (await browser.fetch(endpoint)).text(),'1');
    assert.equal(await (await browser.fetch(endpoint)).text(),'2');
    assert.equal(calls,2);
  }
});

test('GET responses with sufficient max-age may still use the local TTL',async()=>{
  let calls=0;
  const browser=setup(async()=>new Response(String(++calls),{headers:{'cache-control':'public, max-age=60'}}));
  assert.equal(await (await browser.fetch(endpoint)).text(),'1');
  assert.equal(await (await browser.fetch(endpoint)).text(),'1');
  assert.equal(calls,1);
});


test('GET responses with upstream Age do not receive a fresh local TTL',async()=>{
  for(const age of ['1','30','not-a-number','0.5','+0','1e2']){
    let calls=0;
    const browser=setup(async()=>new Response(String(++calls),{headers:{'cache-control':'public, max-age=60',age}}));
    assert.equal(await (await browser.fetch(endpoint)).text(),'1');
    assert.equal(await (await browser.fetch(endpoint)).text(),'2');
    assert.equal(calls,2);
  }
});


test('Age zero preserves eligible local caching while invalid negative Age bypasses it',async()=>{
  for(const [age,expectedCalls] of [['0',1],[' 0 ',1],['-1',2]]){
    let calls=0;
    const browser=setup(async()=>new Response(String(++calls),{headers:{'cache-control':'public, max-age=60',age}}));
    assert.equal(await (await browser.fetch(endpoint)).text(),'1');
    assert.equal(await (await browser.fetch(endpoint)).text(),String(expectedCalls));
    assert.equal(calls,expectedCalls);
  }
});

test('conflicting or malformed max-age directives never extend local freshness',async()=>{
  for(const directive of [
    'max-age=60, max-age=0',
    'max-age=0, max-age=60',
    'public, max-age=60, max-age=30',
    'public, max-age=invalid',
    'public, max-age=+60',
    'public, max-age',
    'public, max-age 60',
    'public, max-age =',
    'public, max-age=60, max-age'
  ]){
    let calls=0;
    const browser=setup(async()=>new Response(String(++calls),{headers:{'cache-control':directive}}));
    assert.equal(await (await browser.fetch(endpoint)).text(),'1');
    assert.equal(await (await browser.fetch(endpoint)).text(),'2');
    assert.equal(calls,2,directive);
  }
});
