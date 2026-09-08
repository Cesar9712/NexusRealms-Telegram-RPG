'use client';

const apiUrl=process.env.NEXT_PUBLIC_API_URL??'http://localhost:3001';
const TTL=45_000;
type Payload={expires:number;status:number;statusText:string;headers:[string,string][];body:string};
const responseCache=new Map<string,Payload>();
const pending=new Map<string,Promise<Payload>>();
let installed=false;

function token(){return sessionStorage.getItem('nr_session')??'';}
function authFrom(init?:RequestInit){const h=new Headers(init?.headers);return h.get('authorization')??'';}
function requestUrl(input:RequestInfo|URL){return typeof input==='string'?input:input instanceof URL?input.toString():input.url;}
function payloadToResponse(p:Payload){return new Response(p.body,{status:p.status,statusText:p.statusText,headers:p.headers});}

export function installFastFetchCache(){
  if(installed||typeof window==='undefined')return;
  installed=true;
  const nativeFetch=window.fetch.bind(window);
  window.fetch=async(input:RequestInfo|URL,init?:RequestInit)=>{
    const url=requestUrl(input),method=String(init?.method??(input instanceof Request?input.method:'GET')).toUpperCase();
    if(!url.startsWith(apiUrl)||!url.includes('/v1/'))return nativeFetch(input,init);
    if(method!=='GET'){
      responseCache.clear();pending.clear();
      return nativeFetch(input,init);
    }
    const key=`${authFrom(init)}::${url}`;
    const hit=responseCache.get(key);
    if(hit&&hit.expires>Date.now())return payloadToResponse(hit);
    if(hit)responseCache.delete(key);
    let wait=pending.get(key);
    if(!wait){
      wait=nativeFetch(input,{...init,cache:'no-store'}).then(async r=>{
        const payload:Payload={expires:Date.now()+TTL,status:r.status,statusText:r.statusText,headers:[...r.headers.entries()],body:await r.clone().text()};
        if(r.ok)responseCache.set(key,payload);
        return payload;
      }).finally(()=>pending.delete(key));
      pending.set(key,wait);
    }
    return payloadToResponse(await wait);
  };
}

function warm(paths:string[],headers:{authorization:string}){
  for(const path of paths)void fetch(`${apiUrl}${path}`,{headers}).catch(()=>{});
}

export function prefetchGameData(){
  installFastFetchCache();
  const session=token();
  if(!session)return;
  const headers={authorization:`Bearer ${session}`};

  // Avoid a burst of a dozen DB-backed requests immediately after Telegram auth.
  // Core screens warm first; deeper systems wait until the initial UI is interactive.
  window.setTimeout(()=>warm(['/v1/inventory','/v1/quests','/v1/bastion'],headers),180);
  window.setTimeout(()=>warm(['/v1/progression','/v1/battle-pass','/v1/clan/dashboard'],headers),650);
  window.setTimeout(()=>warm(['/v1/profession-tree','/v1/shop','/v1/skills'],headers),1300);
  window.setTimeout(()=>warm(['/v1/realms','/v1/daily-rewards','/v1/professions'],headers),2100);
}
