'use client';

const apiUrl=process.env.NEXT_PUBLIC_API_URL??'http://localhost:3001';
type Entry={at:number;data?:any;promise?:Promise<any>};
const cache=new Map<string,Entry>();
const TTL=45_000;

function token(){return sessionStorage.getItem('nr_session')??'';}
function key(path:string){return `${token()}::${path}`;}
export function authHeaders(json=false){return {authorization:`Bearer ${token()}`,...(json?{'content-type':'application/json'}:{})};}
export function actionHeaders(json=true){return {...authHeaders(json),'idempotency-key':crypto.randomUUID()};}

export function peekCached(path:string){const e=cache.get(key(path));return e&&Date.now()-e.at<TTL?e.data:undefined;}

export async function cachedGet(path:string,{force=false,ttl=TTL}:{force?:boolean;ttl?:number}={}){
  const k=key(path),now=Date.now(),existing=cache.get(k);
  if(!force&&existing?.data!==undefined&&now-existing.at<ttl)return existing.data;
  if(!force&&existing?.promise)return existing.promise;
  const promise=fetch(`${apiUrl}${path}`,{headers:authHeaders(),cache:'no-store'}).then(async r=>{
    const j=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(j.error??'LOAD_FAILED');
    cache.set(k,{at:Date.now(),data:j});
    return j;
  }).catch(e=>{const current=cache.get(k);if(current?.promise)cache.set(k,{at:current.at,data:current.data});throw e;});
  cache.set(k,{at:existing?.at??0,data:existing?.data,promise});
  return promise;
}

export function invalidateCached(paths?:string|string[]){
  if(!paths){cache.clear();return;}
  const list=Array.isArray(paths)?paths:[paths],prefix=`${token()}::`;
  for(const k of cache.keys())for(const p of list)if(k===`${prefix}${p}`||k.startsWith(`${prefix}${p}`))cache.delete(k);
}

export function prefetchGameData(){
  const first=['/v1/progression','/v1/inventory','/v1/quests','/v1/bastion','/v1/clan/dashboard','/v1/battle-pass'];
  const second=['/v1/profession-tree','/v1/shop','/v1/skills','/v1/realms','/v1/daily-rewards','/v1/professions'];
  window.setTimeout(()=>{for(const path of first)void cachedGet(path).catch(()=>{});},80);
  window.setTimeout(()=>{for(const path of second)void cachedGet(path).catch(()=>{});},900);
}
