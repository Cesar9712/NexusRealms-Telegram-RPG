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
