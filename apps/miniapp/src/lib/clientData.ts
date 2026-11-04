'use client';

const apiUrl=process.env.NEXT_PUBLIC_API_URL??'http://localhost:3001';
const TTL=45_000;
type Payload={expires:number;status:number;statusText:string;headers:[string,string][];body:string};
const responseCache=new Map<string,Payload>();
const pending=new Map<string,Promise<Payload>>();
const mutationPending=new Map<string,Promise<Payload>>();
let installed=false;
let networkPending=0;
let cacheEpoch=0;
let cachedSession:string|undefined;

function invalidateReads(){
  cacheEpoch++;
  responseCache.clear();
  pending.clear();
}

function token(){return sessionStorage.getItem('nr_session')??'';}
function syncSession(){
  // Default fetch credentials can carry a different user's cookies even when
  // callers do not explicitly set Authorization headers or credentials.
  // Never reuse cached reads or deduplicated writes across login/logout.
  const current=token();
  if(current===cachedSession)return;
  cachedSession=current;
  invalidateReads();
  mutationPending.clear();
}
function isApiRequest(rawUrl:string){
  // A string prefix alone also matches URLs with lookalike authorities
  // (e.g. http://api.example@other-host/v1/) and unrelated /v1/ subpaths.
  try{
    const base=new URL(apiUrl);
    const target=new URL(rawUrl);
    const prefix=base.pathname.replace(/\/+$/,'');
    return target.origin===base.origin&&target.pathname.startsWith(`${prefix}/v1/`);
  }catch{return false;}
}
function requestUrl(input:RequestInfo|URL){return typeof input==='string'?input:input instanceof URL?input.toString():input.url;}
// Fetch responses with these statuses must not have a body, even an empty string.
function payloadToResponse(p:Payload){return new Response([204,205,304].includes(p.status)?null:p.body,{status:p.status,statusText:p.statusText,headers:p.headers});}
function requestHeaders(input:RequestInfo|URL,init?:RequestInit){
  const headers=new Headers(input instanceof Request?input.headers:undefined);
  if(init?.headers)new Headers(init.headers).forEach((value,name)=>headers.set(name,value));
  return JSON.stringify([...headers.entries()].sort(([a],[b])=>a.localeCompare(b)));
}
function mutationKey(input:RequestInfo|URL,init:RequestInit|undefined,method:string,url:string,headers:string){
  // Request bodies are streams and FormData/Blob values cannot be compared safely.
  // Never coalesce mutations whose exact bodies are unknown.
  // Abortable mutations must not share a network request: one caller may cancel independently.
  // Explicit credential modes may use different cookies; never coalesce their mutations.
  if(init?.signal||input instanceof Request||init?.credentials!==undefined)return null;
  if(init?.body!=null&&typeof init.body!=='string')return null;
  return JSON.stringify([method,url,headers,init?.body??'']);
}
function network(delta:number){networkPending=Math.max(0,networkPending+delta);window.dispatchEvent(new CustomEvent('nr-network',{detail:{pending:networkPending}}));}
async function toPayload(r:Response,ttl=0){return{expires:ttl?Date.now()+ttl:0,status:r.status,statusText:r.statusText,headers:[...r.headers.entries()] as [string,string][],body:await r.clone().text()};}

export function installFastFetchCache(){
  if(installed||typeof window==='undefined')return;
  installed=true;
  const nativeFetch=window.fetch.bind(window);
  window.fetch=async(input:RequestInfo|URL,init?:RequestInit)=>{
    const url=requestUrl(input),method=String(init?.method??(input instanceof Request?input.method:'GET')).toUpperCase();
    if(!isApiRequest(url))return nativeFetch(input,init);
    syncSession();
    const headers=requestHeaders(input,init);
    const signal=init?.signal??(input instanceof Request?input.signal:undefined);
    const cacheMode=init?.cache??(input instanceof Request?input.cache:undefined);
    // Fetch cancellation and explicit cache policies must retain native semantics.
    // Request objects always carry a signal, so do not coalesce or cache them.
    // Requests with explicit credential modes may vary by cookie jar/session.
    if(method==='GET'&&(signal||init?.credentials!==undefined||['no-store','no-cache','reload'].includes(cacheMode??'')))return nativeFetch(input,init);

    if(method!=='GET'){
      // Reads can become stale both when a mutation starts and when it settles.
      invalidateReads();
      const key=mutationKey(input,init,method,url,headers);
      let wait=key===null?undefined:mutationPending.get(key);
      if(!wait){
        network(1);
        wait=nativeFetch(input,{...init,cache:'no-store'})
          .then(r=>toPayload(r))
          .finally(()=>{
            // A GET completed during the mutation may have cached pre-write state.
            invalidateReads();
            if(key!==null&&mutationPending.get(key)===wait)mutationPending.delete(key);
            network(-1);
          });
        if(key!==null)mutationPending.set(key,wait);
      }
      return payloadToResponse(await wait);
    }

    const key=`${headers}::${url}`;
    const hit=responseCache.get(key);
    if(hit&&hit.expires>Date.now())return payloadToResponse(hit);
    if(hit)responseCache.delete(key);
    let wait=pending.get(key);
    if(!wait){
      const epoch=cacheEpoch;
      network(1);
      wait=nativeFetch(input,{...init,cache:'no-store'}).then(async r=>{
        const payload=await toPayload(r,TTL);
        // A 206 is a successful but incomplete representation; never reuse it for a full GET.
        if(r.status===200&&!/\b(?:no-store|no-cache|private)\b/i.test(r.headers.get('cache-control')??'')&&epoch===cacheEpoch)responseCache.set(key,payload);
        return payload;
      }).finally(()=>{if(pending.get(key)===wait)pending.delete(key);network(-1)});
      pending.set(key,wait);
    }
    return payloadToResponse(await wait);
  };
}

function warm(paths:string[],headers:{authorization:string},expectedSession:string){
  // A delayed prefetch must never replay credentials from a previous login.
  // Check each request, since the session can change while a batch is warming.
  for(const path of paths){
    if(token()!==expectedSession)return;
    void fetch(`${apiUrl.replace(/\/+$/,'')}${path}`,{headers}).catch(()=>{});
  }
}

export function prefetchGameData(){
  installFastFetchCache();
  const session=token();
  if(!session)return;
  const headers={authorization:`Bearer ${session}`};

  // Avoid a burst of a dozen DB-backed requests immediately after Telegram auth.
  // Core screens warm first; deeper systems wait until the initial UI is interactive.
  window.setTimeout(()=>warm(['/v1/inventory','/v1/quests','/v1/bastion'],headers,session),180);
  window.setTimeout(()=>warm(['/v1/progression','/v1/battle-pass','/v1/clan/dashboard'],headers,session),650);
  window.setTimeout(()=>warm(['/v1/profession-tree','/v1/shop','/v1/skills'],headers,session),1300);
  window.setTimeout(()=>warm(['/v1/realms','/v1/daily-rewards','/v1/professions'],headers,session),2100);
}
