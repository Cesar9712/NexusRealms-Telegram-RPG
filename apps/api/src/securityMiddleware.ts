import type { Hono } from 'hono';

type Bucket={count:number;reset:number};
const buckets=new Map<string,Bucket>();
let requests=0;
function clientKey(c:any){return String(c.req.header('cf-connecting-ip')??c.req.header('x-forwarded-for')?.split(',')[0]??'unknown').trim().slice(0,80);}
function limitFor(method:string,path:string){if(path==='/v1/auth/telegram')return 20;if(method==='GET')return 180;return 60;}
function consume(key:string,limit:number){const now=Date.now();const current=buckets.get(key);if(!current||current.reset<=now){buckets.set(key,{count:1,reset:now+60_000});return{ok:true,remaining:limit-1,reset:now+60_000};}current.count++;return{ok:current.count<=limit,remaining:Math.max(0,limit-current.count),reset:current.reset};}
function prune(){const now=Date.now();for(const [k,v] of buckets)if(v.reset<=now)buckets.delete(k);}

export function installSecurityMiddleware(app:Hono){
  app.use('*',async(c,next)=>{
    const started=Date.now();const requestId=crypto.randomUUID();const method=c.req.method.toUpperCase();const path=c.req.path;
    if(method!=='GET'&&method!=='HEAD'&&method!=='OPTIONS'){
      const length=Number(c.req.header('content-length')??0);if(Number.isFinite(length)&&length>65_536)return c.json({error:'REQUEST_TOO_LARGE',requestId},413);
    }
    const limit=limitFor(method,path);const rate=consume(`${clientKey(c)}:${method}:${path}`,limit);
    if(!rate.ok){c.header('Retry-After',String(Math.max(1,Math.ceil((rate.reset-Date.now())/1000))));return c.json({error:'RATE_LIMITED',requestId},429);}
    c.header('X-Request-Id',requestId);c.header('X-RateLimit-Remaining',String(rate.remaining));
    await next();
    c.header('X-Content-Type-Options','nosniff');c.header('Referrer-Policy','no-referrer');c.header('Permissions-Policy','camera=(), microphone=(), geolocation=()');c.header('Cache-Control',path.startsWith('/v1/')?'no-store':'no-cache');
    const duration=Date.now()-started;const status=c.res.status;
    // Log only operational metadata. Never log authorization, Telegram initData, bodies or secrets.
    if(status>=500||duration>1500)console.warn(JSON.stringify({kind:'request',requestId,method,path,status,durationMs:duration}));
    requests++;if(requests%200===0)prune();
  });
}
