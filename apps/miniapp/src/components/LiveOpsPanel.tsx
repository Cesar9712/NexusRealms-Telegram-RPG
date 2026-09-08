'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import {
  Award, CalendarDays, Check, ChevronRight, CircleDollarSign, Coins, Crown, Gift,
  LoaderCircle, LockKeyhole, Search, Shield, ShoppingBag, Sparkles, Swords, Target,
  Trophy, UserPlus, Users, X,
} from 'lucide-react';
import type { Snapshot } from './GameHome';

const apiUrl=process.env.NEXT_PUBLIC_API_URL??'http://localhost:3001';
const handled=new Set(['clan','events','battlepass','referrals']);
const auth=()=>({authorization:`Bearer ${sessionStorage.getItem('nr_session')??''}`});
const action=()=>({...auth(),'content-type':'application/json','idempotency-key':crypto.randomUUID()});
const human:Record<string,string>={
  INSUFFICIENT_CREDITS:'Necesitas más Créditos Premium.',ALREADY_IN_CLAN:'Ya perteneces a un clan.',INVALID_CLAN:'Revisa el nombre y la sigla del clan.',
  INSUFFICIENT_RESOURCE:'No tienes suficientes recursos.',PROJECT_COMPLETE:'Este proyecto ya está completo.',CLAN_OFFICER_REQUIRED:'Solo líder u oficiales pueden realizar esta acción.',
  MISSION_REWARD_UNAVAILABLE:'La misión todavía no está lista para reclamar.',INSUFFICIENT_CLAN_COINS:'No tienes suficientes monedas de clan.',SHOP_ITEM_LOCKED:'Este objeto todavía está bloqueado.',
  CLAN_WAR_ALREADY_OPEN:'Tu clan ya tiene una guerra activa.',NO_CLAN_OPPONENT:'No hay rival disponible ahora.',NO_WAR_ATTEMPTS:'Ya usaste tus ataques de esta guerra.',WAR_CLOSED:'Esta guerra ya terminó.',
  EVENT_TIER_LOCKED:'Todavía no alcanzaste este hito.',ALREADY_CLAIMED:'Esta recompensa ya fue reclamada.',REFERRAL_MILESTONE_LOCKED:'Aún no alcanzaste este hito de referidos.',
  PREMIUM_REQUIRED:'Necesitas el Pase Premium.',LEVEL_LOCKED:'Todavía no alcanzaste ese nivel del Pase.'
};
const errorText=(v:string)=>human[v]??v.replaceAll('_',' ').toLowerCase();
const num=(v:unknown)=>Number(v??0);
const pct=(value:number,max:number)=>`${Math.max(0,Math.min(100,(value/Math.max(1,max))*100))}%`;
const timeLeft=(iso:string)=>{const ms=new Date(iso).getTime()-Date.now();if(ms<=0)return'Finalizado';const h=Math.floor(ms/3600000),m=Math.floor(ms%3600000/60000);return h>0?`${h} h ${m} min`:`${Math.max(1,m)} min`;};

function RewardView({reward}:{reward:any}){
 const entries:ReactElement[]=[];const push=(key:string,label:string,value:unknown,Icon:any)=>{if(num(value)>0)entries.push(<span key={key}><Icon/>{num(value).toLocaleString()} {label}</span>)};
 push('gold','oro',reward?.gold,Coins);push('xp','EXP',reward?.xp,Sparkles);push('crystals','cristales',reward?.crystals,Sparkles);push('clan','monedas de clan',reward?.clan_coins,Shield);push('earn','Earn',reward?.earn,CircleDollarSign);
 if(reward?.resources&&typeof reward.resources==='object')for(const[k,v]of Object.entries(reward.resources))if(num(v)>0)entries.push(<span key={k}><Gift/>{num(v)} {k.replaceAll('_',' ')}</span>);
 if(reward?.chest)entries.push(<span key="chest"><Gift/>Cofre {String(reward.chest)}</span>);
 if(reward?.pet)entries.push(<span key="pet"><Award/>Mascota {String(reward.pet)}</span>);
 if(reward?.mount)entries.push(<span key="mount"><Award/>Montura {String(reward.mount)}</span>);
 if(reward?.battle_pass_premium)entries.push(<span key="pass"><Crown/>Pase Premium</span>);
 return <div className="live-rewards">{entries.length?entries:<span><Gift/>Recompensa especial</span>}</div>;
}

export function LiveOpsPanel({active,snapshot,onClose,onSnapshot}:{active:string;snapshot:Snapshot;onClose:()=>void;onSnapshot:(value:Snapshot)=>void}){
 const visible=handled.has(active);const[data,setData]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[search,setSearch]=useState(''),[clanName,setClanName]=useState(''),[clanTag,setClanTag]=useState(''),[clanDescription,setClanDescription]=useState('');
 const premium=useMemo(()=>num(snapshot.resources.find(r=>r.resource_code==='premium_credits')?.amount),[snapshot]);
 const clanCoins=useMemo(()=>num(snapshot.resources.find(r=>r.resource_code==='clan_coins')?.amount),[snapshot]);
 async function get(path:string){const r=await fetch(`${apiUrl}${path}`,{headers:auth()});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error??'LOAD_FAILED');return j;}
 async function refreshSnapshot(){const r=await fetch(`${apiUrl}/v1/me/snapshot`,{headers:auth()});if(r.ok)onSnapshot(await r.json());}
 async function load(){if(!visible)return;setError('');try{
   if(active==='clan'){const [live,base]=await Promise.all([get('/v1/clan/live'),get('/v1/clan/me')]);let discovery:any={clans:[]};if(!live.clan)discovery=await get(`/v1/clans?q=${encodeURIComponent(search)}`);setData({live,base,discovery});return;}
   if(active==='events'){setData(await get('/v1/events/live'));return;}
   if(active==='battlepass'){const[pass,missions]=await Promise.all([get('/v1/battle-pass'),get('/v1/battle-pass/missions')]);setData({pass,missions});return;}
   if(active==='referrals'){const[base,milestones]=await Promise.all([get('/v1/referrals'),get('/v1/referrals/milestones')]);setData({base,milestones});return;}
 }catch(e:any){setError(errorText(e.message??'LOAD_FAILED'));}}
 useEffect(()=>{setData(null);void load();},[active]);
 async function post(path:string,body:any={}){setBusy(true);setError('');try{const r=await fetch(`${apiUrl}${path}`,{method:'POST',headers:action(),body:JSON.stringify(body)});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error??'ACTION_FAILED');await Promise.all([load(),refreshSnapshot()]);return j;}catch(e:any){setError(errorText(e.message??'ACTION_FAILED'));return null;}finally{setBusy(false)}}
 async function searchClans(){setBusy(true);try{const discovery=await get(`/v1/clans?q=${encodeURIComponent(search)}`);setData((old:any)=>({...old,discovery}));}catch(e:any){setError(errorText(e.message));}finally{setBusy(false)}}
 if(!visible)return null;
 const meta=active==='clan'?{title:'Clanes 3.0',sub:'PROGRESIÓN SOCIAL',Icon:Users}:active==='events'?{title:'Eventos del Nexo',sub:'LIVEOPS',Icon:CalendarDays}:active==='battlepass'?{title:'Pase de Batalla',sub:'TEMPORADA',Icon:Trophy}:{title:'Referidos',sub:'COMUNIDAD',Icon:UserPlus};
 const MetaIcon=meta.Icon;
 return <section className={`module-overlay liveops-overlay liveops-${active}`} aria-label={meta.title}>
  <header><div><MetaIcon/><span><small>{meta.sub}</small><strong>{meta.title}</strong></span></div><button onClick={onClose}><X/></button></header>
  {error&&<div className="module-error">{error}</div>}
  {!data&&<div className="live-loading"><LoaderCircle/><b>Sincronizando {meta.title.toLowerCase()}</b><span>Los datos se cargan desde el servidor.</span></div>}
  {active==='clan'&&data&&<ClanContent data={data} premium={premium} clanCoins={clanCoins} busy={busy} search={search} setSearch={setSearch} searchClans={searchClans} clanName={clanName} setClanName={setClanName} clanTag={clanTag} setClanTag={setClanTag} clanDescription={clanDescription} setClanDescription={setClanDescription} post={post}/>} 
  {active==='events'&&data&&<EventsContent data={data} busy={busy} post={post}/>} 
  {active==='battlepass'&&data&&<PassContent data={data} snapshot={snapshot} busy={busy} post={post}/>} 
  {active==='referrals'&&data&&<ReferralContent data={data} busy={busy} post={post}/>} 
 </section>;
}

function ClanContent({data,premium,clanCoins,busy,search,setSearch,searchClans,clanName,setClanName,clanTag,setClanTag,clanDescription,setClanDescription,post}:any){
 const live=data.live,base=data.base;if(!live?.clan)return <div className="live-stack">
  <section className="live-hero empty-clan"><Users/><div><small>SIN CLAN</small><h2>Funda tu propio legado</h2><p>Crear un clan cuesta 500 Créditos Premium. El cobro se valida en el servidor y solo ocurre si la creación termina correctamente.</p></div><span className={premium>=500?'affordable':'insufficient'}><Crown/>{premium.toLocaleString()} / 500</span></section>
  <section className="live-card"><h3>Crear clan</h3><label>Nombre<input value={clanName} onChange={(e:any)=>setClanName(e.target.value)} maxLength={40}/></label><label>Sigla<input value={clanTag} onChange={(e:any)=>setClanTag(e.target.value.toUpperCase())} maxLength={5}/></label><label>Descripción<textarea value={clanDescription} onChange={(e:any)=>setClanDescription(e.target.value)} maxLength={240}/></label><button className="module-primary" disabled={busy||premium<500||clanName.trim().length<3||clanTag.trim().length<2} onClick={()=>post('/v1/clans',{name:clanName,tag:clanTag,description:clanDescription})}><Crown/>CREAR CLAN · 500 CRÉDITOS</button></section>
  <section className="live-card"><h3>Buscar clan</h3><div className="live-search"><Search/><input value={search} onChange={(e:any)=>setSearch(e.target.value)} placeholder="Nombre o sigla"/><button onClick={searchClans} disabled={busy}>Buscar</button></div><div className="live-list">{(data.discovery?.clans??[]).map((clan:any)=><article key={clan.id}><div className="clan-emblem">{String(clan.tag).slice(0,2)}</div><div><b>[{clan.tag}] {clan.name}</b><span>Nivel {clan.level} · {clan.members} miembros</span><small>{clan.description||'Clan abierto a nuevas leyendas.'}</small></div><button disabled={busy} onClick={()=>post(`/v1/clans/${clan.id}/join`)}>UNIRME</button></article>)}</div></section>
 </div>;
 const clan=live.clan,war=(live.wars??[]).find((w:any)=>w.status==='active'),raid=(base?.raids??[]).find((r:any)=>r.status==='active');
 return <div className="live-stack">
  <section className="live-hero clan-live-hero"><div className="clan-emblem large">{String(clan.tag).slice(0,2)}</div><div><small>CLAN NIVEL {clan.level}</small><h2>[{clan.tag}] {clan.name}</h2><p>{(base?.members??[]).length} miembros · Rol {clan.role} · Ciclo {live.cycle}</p></div><span><Shield/>{clanCoins.toLocaleString()} monedas</span></section>
  {raid&&<section className="live-card live-raid"><div className="live-card-title"><Swords/><div><small>RAID ACTIVA</small><h3>{raid.boss_id.replaceAll('-',' ')}</h3></div><span>{timeLeft(raid.ends_at)}</span></div><div className="live-progress"><i style={{width:pct(num(raid.boss_hp_max)-num(raid.boss_hp_remaining),num(raid.boss_hp_max))}}/></div><p>{num(raid.boss_hp_remaining).toLocaleString()} HP restantes</p><button className="module-primary" disabled={busy} onClick={()=>post(`/v1/clan/raids/${raid.id}/attack`)}><Swords/>ATACAR JEFE</button></section>}
  <section className="live-section"><div className="live-section-title"><Target/><div><small>COOPERATIVO</small><h3>Proyectos del clan</h3></div></div><div className="live-grid">{(live.projects??[]).map((p:any)=><article className={p.completed_at?'complete':''} key={p.project_id}><b>{p.name_es}</b><p>{p.description_es}</p><div className="live-progress"><i style={{width:pct(num(p.progress),num(p.target))}}/></div><span>{num(p.progress).toLocaleString()} / {num(p.target).toLocaleString()} {p.resource_code}</span><RewardView reward={p.rewards}/><button disabled={busy||Boolean(p.completed_at)} onClick={()=>post(`/v1/clan/projects/${p.project_id}/contribute`,{amount:Math.min(100,Math.max(1,num(p.target)-num(p.progress)))})}>{p.completed_at?<><Check/>COMPLETO</>:<>APORTAR HASTA 100</>}</button></article>)}</div></section>
  <section className="live-section"><div className="live-section-title"><Award/><div><small>SEMANAL</small><h3>Misiones de clan</h3></div></div><div className="live-grid">{(live.missions??[]).map((m:any)=><article key={m.mission_id}><b>{m.name_es}</b><div className="live-progress"><i style={{width:pct(num(m.progress),num(m.target))}}/></div><span>{num(m.progress)} / {num(m.target)} · {m.metric.replaceAll('_',' ')}</span><RewardView reward={m.rewards}/><button disabled={busy||!m.completed_at||Boolean(m.claimed_at)} onClick={()=>post(`/v1/clan/missions/${m.mission_id}/claim`)}>{m.claimed_at?'RECLAMADA':m.completed_at?'RECLAMAR':'EN PROGRESO'}</button></article>)}</div></section>
  <section className="live-section"><div className="live-section-title"><ShoppingBag/><div><small>MONEDA DE CLAN</small><h3>Tienda de clan</h3></div></div><div className="live-grid">{(live.shop??[]).map((item:any)=><article key={item.id}><b>{item.name_es}</b><span>Nivel de clan {item.min_clan_level}+</span><RewardView reward={item.contents}/><button disabled={busy||clanCoins<num(item.price_clan_coins)} onClick={()=>post(`/v1/clan/shop/${item.id}/buy`)}><Shield/>{num(item.price_clan_coins)} monedas</button></article>)}</div></section>
  <section className="live-section"><div className="live-section-title"><Swords/><div><small>CLAN VS CLAN</small><h3>Guerra</h3></div></div>{war?<article className="war-card"><div><b>{war.clan_a_name}</b><strong>{war.score_a} : {war.score_b}</strong><b>{war.clan_b_name}</b></div><span>{timeLeft(war.ends_at)}</span><button className="module-primary" disabled={busy} onClick={()=>post(`/v1/clan/wars/${war.id}/attack`)}><Swords/>ATACAR · MÁXIMO 3 INTENTOS</button></article>:<button className="module-primary" disabled={busy||!['leader','officer'].includes(String(clan.role))} onClick={()=>post('/v1/clan/wars/match')}><Search/>BUSCAR CLAN RIVAL</button>}</section>
  <section className="live-section"><div className="live-section-title"><Users/><div><small>ROSTER</small><h3>Miembros</h3></div></div><div className="roster-list">{(base?.members??[]).map((m:any)=><article key={m.id}><div className="clan-emblem">{String(m.character_name??m.display_name).slice(0,1)}</div><div><b>{m.character_name??m.display_name}</b><span>Nv. {m.level??'-'} · Poder {num(m.power).toLocaleString()}</span></div><em>{m.role}</em></article>)}</div></section>
 </div>;
}

function EventsContent({data,busy,post}:any){
 const tiersBy=new Map<string,any[]>();for(const t of data.tiers??[]){const rows=tiersBy.get(String(t.instance_id))??[];rows.push(t);tiersBy.set(String(t.instance_id),rows);}
 return <div className="live-stack">{(data.events??[]).length===0?<div className="empty-state"><CalendarDays/><b>No hay eventos activos</b><span>El sistema LiveOps puede programar invasiones, bosses, recursos y competiciones sin alterar el cliente.</span></div>:(data.events??[]).map((e:any)=><section className="event-live-card" key={e.instance_id}><div className="event-banner"><Sparkles/><div><small>{e.event_type.toUpperCase()}</small><h2>{e.name_es}</h2><p>{e.description_es}</p></div><span>{timeLeft(e.ends_at)}</span></div><div className="event-contribution"><Target/><div><small>TU CONTRIBUCIÓN</small><b>{num(e.contribution).toLocaleString()}</b></div></div><div className="event-tiers">{(tiersBy.get(String(e.instance_id))??[]).map((t:any)=><article className={num(e.contribution)>=num(t.target)?'unlocked':'locked'} key={t.tier}><span className="tier-orb">{t.tier}</span><div><b>Hito {t.tier}</b><span>{num(e.contribution)} / {num(t.target)}</span><RewardView reward={t.reward}/></div><button disabled={busy||t.claimed||num(e.contribution)<num(t.target)} onClick={()=>post(`/v1/events/${e.instance_id}/tiers/${t.tier}/claim`)}>{t.claimed?<Check/>:num(e.contribution)>=num(t.target)?<Gift/>:<LockKeyhole/>}</button></article>)}</div></section>)}</div>;
}

function PassContent({data,snapshot,busy,post}:any){
 const pass=data.pass,missions=data.missions?.missions??[];const progress=pass?.progress??pass?.battlePass??snapshot.battlePass;const rewards=pass?.rewards??[];const groups=new Map<number,any>();for(const r of rewards){const level=num(r.level),row=groups.get(level)??{};row[r.track]=r;groups.set(level,row);}const level=num(progress?.level??snapshot.battlePass?.level),premium=Boolean(progress?.premium_unlocked??snapshot.battlePass?.premium_unlocked);
 return <div className="live-stack"><section className="pass-live-hero"><Trophy/><div><small>TEMPORADA ACTIVA</small><h2>Nivel {level}</h2><p>{num(progress?.xp??snapshot.battlePass?.xp)%100}/100 XP al siguiente nivel</p></div><span className={premium?'premium':'free'}><Crown/>{premium?'PREMIUM':'GRATIS'}</span></section>
  <section className="live-section"><div className="live-section-title"><Target/><div><small>OBJETIVOS</small><h3>Misiones del Pase</h3></div></div><div className="mission-lanes">{['daily','weekly','season'].map(period=><div key={period}><h4>{period==='daily'?'Diarias':period==='weekly'?'Semanales':'Temporada'}</h4>{missions.filter((m:any)=>m.period===period).map((m:any)=><article key={m.id} className={m.completed_at?'complete':''}><div><b>{m.name_es}</b><span>{num(m.progress)} / {num(m.target)} · +{num(m.xp_reward)} XP Pase</span></div><div className="live-progress"><i style={{width:pct(num(m.progress),num(m.target))}}/></div>{m.completed_at&&<Check/>}</article>)}</div>)}</div></section>
  {!premium&&<button className="module-primary premium-buy" disabled={busy} onClick={()=>post('/v1/shop/pass-premium/purchase-enhanced')}><Crown/>DESBLOQUEAR RUTA PREMIUM</button>}
  <section className="live-section"><div className="live-section-title"><Gift/><div><small>RECOMPENSAS</small><h3>Ruta de temporada</h3></div></div><div className="pass-track-premium">{[...groups.entries()].sort((a,b)=>a[0]-b[0]).map(([lvl,row])=><article className={level>=lvl?'unlocked':'locked'} key={lvl}><div className="pass-level"><Trophy/><b>{lvl}</b></div>{(['free','premium'] as const).map(track=>{const reward=row[track];if(!reward)return null;const locked=level<lvl||(track==='premium'&&!premium);return <section className={`pass-reward ${track}`} key={track}><small>{track==='free'?'GRATIS':'PREMIUM'}</small><RewardView reward={reward.reward}/><button disabled={busy||locked||reward.claimed} onClick={()=>post(`/v1/battle-pass/${lvl}/${track}/claim-enhanced`)}>{reward.claimed?'RECLAMADO':locked?'BLOQUEADO':'RECLAMAR'}</button></section>})}</article>)}</div></section>
 </div>;
}

function ReferralContent({data,busy,post}:any){const base=data.base,m=data.milestones;const code=base?.profile?.referral_code;const share=async()=>{const url=`https://t.me/NexusRealmsLegendsBot?start=ref_${code}`;try{if(navigator.share)await navigator.share({title:'Nexus Realms',text:'Únete a mi clan y forja tu leyenda.',url});else await navigator.clipboard.writeText(url);}catch{}};return <div className="live-stack"><section className="referral-hero"><UserPlus/><div><small>REFERIDOS CALIFICADOS</small><h2>{num(m?.qualified)}</h2><p>Solo cuentan como calificados cuando progresan hasta nivel 3. Esto reduce cuentas falsas y auto-referidos inútiles.</p></div></section><button className="module-primary" onClick={share}><UserPlus/>COMPARTIR INVITACIÓN</button><section className="live-section"><div className="live-section-title"><Award/><div><small>HITOS</small><h3>Recompensas acumulativas</h3></div></div><div className="referral-road">{(m?.rewards??[]).map((r:any)=><article className={num(m.qualified)>=num(r.milestone)?'unlocked':'locked'} key={r.milestone}><div className="milestone-node"><b>{r.milestone}</b><span>amigos</span></div><RewardView reward={r.reward}/><button disabled={busy||r.claimed||num(m.qualified)<num(r.milestone)} onClick={()=>post(`/v1/referrals/milestones/${r.milestone}/claim`)}>{r.claimed?'RECLAMADO':num(m.qualified)>=num(r.milestone)?'RECLAMAR':'BLOQUEADO'}</button></article>)}</div></section><section className="live-section"><div className="live-section-title"><Users/><div><small>COMUNIDAD</small><h3>Invitados recientes</h3></div></div><div className="roster-list">{(base?.invited??[]).map((v:any,i:number)=><article key={`${v.display_name}-${i}`}><div className="clan-emblem"><UserPlus/></div><div><b>{v.display_name}</b><span>Nivel {v.level??'sin personaje'}</span></div></article>)}</div></section></div>}
