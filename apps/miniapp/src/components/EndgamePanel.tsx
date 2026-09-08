'use client';

import { useEffect, useState } from 'react';
import { Castle, ChevronRight, Clock3, Crown, Flame, Map, Shield, Sparkles, Swords, Trophy, X } from 'lucide-react';
import type { Snapshot } from './GameHome';

const apiUrl=process.env.NEXT_PUBLIC_API_URL??'http://localhost:3001';
const auth=()=>({authorization:`Bearer ${sessionStorage.getItem('nr_session')??''}`});
const action=()=>({...auth(),'content-type':'application/json','idempotency-key':crypto.randomUUID()});
const labels:Record<string,string>={NO_ENERGY:'No tienes energía suficiente.',BOSS_WRONG_REALM:'Ese jefe pertenece a otro reino.',BOSS_LEVEL_REQUIRED:'Aún no tienes nivel suficiente para desafiar a este jefe.',DUNGEON_ALREADY_ACTIVE:'Termina tu mazmorra activa antes de iniciar otra.',DUNGEON_DAILY_LIMIT:'Alcanzaste el límite diario de esta mazmorra.',DUNGEON_LEVEL_REQUIRED:'Aún no tienes nivel suficiente.',DUNGEON_REWARD_UNAVAILABLE:'La recompensa todavía no está disponible.',TOWER_DAILY_LIMIT:'Ya consumiste los intentos de Torre de hoy.',EXPEDITION_SLOTS_FULL:'Tus dos espacios de expedición están ocupados.',EXPEDITION_LEVEL_REQUIRED:'Aún no tienes nivel suficiente para esta expedición.',NOT_READY:'Todavía no ha terminado.'};
const human=(value:string)=>labels[value]??value.replaceAll('_',' ').toLowerCase();
function time(seconds:number){if(seconds<3600)return `${Math.ceil(seconds/60)} min`;return `${(seconds/3600).toFixed(seconds%3600?1:0)} h`;}
function rewardText(r:any){if(!r||typeof r!=='object')return 'Recompensa especial';const p:string[]=[];if(Number(r.gold)>0)p.push(`${Number(r.gold).toLocaleString()} oro`);if(Number(r.xp)>0)p.push(`${Number(r.xp).toLocaleString()} EXP`);if(r.resources)for(const [k,v] of Object.entries(r.resources))p.push(`${v} ${k}`);if(Number(r.crystals)>0)p.push(`${r.crystals} cristales`);if(r.item)p.push(`reliquia ${r.item}`);return p.join(' · ')||'Recompensa especial';}

export function EndgamePanel({active,snapshot,onClose,onSnapshot}:{active:string;snapshot:Snapshot;onClose:()=>void;onSnapshot:(s:Snapshot)=>void}){
 const visible=active==='endgame';const [data,setData]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState<any>(null);
 async function load(){if(!visible)return;setError('');try{const r=await fetch(`${apiUrl}/v1/endgame`,{headers:auth()});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error??'LOAD_FAILED');setData(j);}catch(e:any){setError(human(e.message));}}
 async function refresh(){const r=await fetch(`${apiUrl}/v1/me/snapshot`,{headers:auth()});if(r.ok)onSnapshot(await r.json());}
 useEffect(()=>{setResult(null);void load();},[active]);
 async function post(path:string){setBusy(true);setError('');try{const r=await fetch(`${apiUrl}${path}`,{method:'POST',headers:action(),body:'{}'});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error??'ACTION_FAILED');setResult(j.response??j);await Promise.all([load(),refresh()]);return j;}catch(e:any){setError(human(e.message));return null;}finally{setBusy(false)}}
 if(!visible)return null;
 const currentRuns=(data?.runs??[]).filter((r:any)=>['active','completed'].includes(r.state));
 return <section className="module-overlay endgame-overlay" aria-label="Endgame">
  <header><div><Crown/><span><small>CONTENIDO DE ALTO NIVEL</small><strong>Endgame del Nexo</strong></span></div><button onClick={onClose}><X/></button></header>
  {error&&<div className="module-error">{error}</div>}
  {result&&<div className={`endgame-result ${result.won===false?'lost':'won'}`}><Sparkles/><div><b>{result.won===false?'Desafío fallido':result.completed?'Mazmorra completada':result.claimed?'Recompensa obtenida':result.won?'Victoria':'Progreso guardado'}</b><span>{result.reward?rewardText(result.reward):result.floor?`Piso ${result.floor} · siguiente ${result.nextFloor}`:'El servidor guardó el resultado.'}</span></div></div>}

  <section className="endgame-hero"><div><span className="eyebrow">DESAFÍOS MAYORES</span><h2>El Nexo no termina al subir de nivel</h2><p>Jefes por fases, mazmorras con límites diarios, Torre con checkpoints y expediciones temporizadas complementan el loop sin volverlo idle.</p></div><Trophy/></section>

  <div className="module-section-head"><div><small>JEFES DEL REINO</small><h3>Amenazas mayores</h3></div><Flame/></div>
  <div className="endgame-card-grid">{(data?.bosses??[]).length===0?<div className="empty-state"><Shield/><b>No hay jefe disponible aquí</b><span>Viaja a otro reino o aumenta tu nivel.</span></div>:(data.bosses??[]).map((b:any)=><article className="boss-card" key={b.id}><div className="endgame-icon boss"><Flame/></div><span className="eyebrow">{b.boss_type} · NV. {b.level}</span><b>{b.name_es}</b><p>{b.lore_es||'Una amenaza mayor vinculada al Nexo.'}</p><div className="boss-stats"><span>{Number(b.max_hp).toLocaleString()} HP</span><span>{(b.phases??[]).length||3} fases</span></div><button className="module-primary" disabled={busy} onClick={()=>post(`/v1/bosses/${b.id}/challenge`)}><Swords/>DESAFIAR · 2 ENERGÍA</button></article>)}</div>

  <div className="module-section-head"><div><small>MAZMORRAS</small><h3>Instancias limitadas</h3></div><Castle/></div>
  {currentRuns.length>0&&<div className="endgame-active-runs">{currentRuns.map((r:any)=><article key={r.id}><div><b>{r.name_es}</b><span>Sala {r.room_index}/{r.room_count} · {r.difficulty}</span></div>{r.state==='active'?<button disabled={busy} onClick={()=>post(`/v1/dungeons/runs/${r.id}/advance`)}>Avanzar <ChevronRight/></button>:<button disabled={busy} onClick={()=>post(`/v1/dungeons/runs/${r.id}/claim`)}>Reclamar</button>}</article>)}</div>}
  <div className="endgame-card-grid">{(data?.dungeons??[]).map((d:any)=><article key={d.id}><div className="endgame-icon"><Castle/></div><span className="eyebrow">{String(d.difficulty).toUpperCase()} · NV. {d.min_level}</span><b>{d.name_es}</b><p>{d.room_count} salas · límite {d.daily_limit}/día · {d.energy_cost} energía</p><small>{rewardText(d.rewards)}</small><button disabled={busy||currentRuns.some((r:any)=>r.state==='active')} onClick={()=>post(`/v1/dungeons/${d.id}/start`)}>ENTRAR</button></article>)}</div>

  <div className="module-section-head"><div><small>TORRE DEL NEXO</small><h3>Ascenso controlado</h3></div><Trophy/></div>
  <div className="tower-card"><div className="tower-ring"><Trophy/></div><div><span className="eyebrow">CHECKPOINT {data?.tower?.checkpoint_floor??1}</span><h2>Piso {data?.tower?.current_floor??1}</h2><p>Mejor piso: {data?.tower?.best_floor??0} · intentos hoy: {data?.tower?.attempts_today??0}/10</p><small>Los hitos cada 5 pisos se recompensan una sola vez.</small></div><button className="module-primary" disabled={busy} onClick={()=>post('/v1/tower/challenge')}><Swords/>DESAFIAR PISO</button></div>

  <div className="module-section-head"><div><small>EXPEDICIONES</small><h3>Actividad complementaria</h3></div><Map/></div>
  <div className="expedition-running">{(data?.expeditions??[]).map((e:any)=>{const ready=new Date(e.finishes_at).getTime()<=Date.now();return <article key={e.id}><Clock3/><div><b>{e.name_es}</b><span>{ready?'Lista para recoger':`Finaliza ${new Date(e.finishes_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`}</span></div><button disabled={busy||!ready} onClick={()=>post(`/v1/expeditions/runs/${e.id}/claim`)}>{ready?'RECOGER':'EN CURSO'}</button></article>})}</div>
  <div className="endgame-card-grid expeditions">{(data?.expeditionDefinitions??[]).map((e:any)=><article key={e.id}><div className="endgame-icon"><Map/></div><b>{e.name_es}</b><span>NV. {e.min_level} · {time(Number(e.duration_seconds))}</span><small>{rewardText(e.rewards)}</small><button disabled={busy||(data?.expeditions??[]).length>=2} onClick={()=>post(`/v1/expeditions/${e.id}/start`)}>ENVIAR · {e.energy_cost} EN</button></article>)}</div>
 </section>;
}
