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

function setup(fetcher){
  const browser={fetch:fetcher,dispatchEvent(){},setTimeout};
  const exports={};
  const context=vm.createContext({exports,window:browser,sessionStorage:{getItem:()=>null},process:{env:{}},Headers,Request,Response,URL,CustomEvent:class{constructor(type,init){this.type=type;this.detail=init?.detail}}});
  vm.runInContext(js,context);
  exports.installFastFetchCache();
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
