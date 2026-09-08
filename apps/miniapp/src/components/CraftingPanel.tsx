'use client';

import { useEffect, useState } from 'react';
import { BookOpen, Clock3, Coins, Hammer, Package, Sparkles, X } from 'lucide-react';
import type { Snapshot } from './GameHome';

const apiUrl=process.env.NEXT_PUBLIC_API_URL??'http://localhost:3001';
const authHeaders=(json=false)=>({authorization:`Bearer ${sessionStorage.getItem('nr_session')??''}`,...(json?{'content-type':'application/json'}:{})});
const actionHeaders=()=>({...authHeaders(true),'idempotency-key':crypto.randomUUID()});
const errors:Record<string,string>={PROFESSION_LEVEL_REQUIRED:'Tu profesión todavía no tiene el nivel requerido.',INSUFFICIENT_GOLD:'No tienes suficiente oro.',INSUFFICIENT_MATERIALS:'Te faltan materiales.',NOT_READY:'La fabricación todavía no ha terminado.',ALREADY_CLAIMED:'Ya recogiste esta fabricación.'};
function duration(seconds:number){const s=Math.max(0,Math.round(seconds));if(s<60)return `${s}s`;if(s<3600)return `${Math.ceil(s/60)} min`;return `${(s/3600).toFixed(s%3600?1:0)} h`;}

export function CraftingPanel({active,onClose,onSnapshot}:{active:string;snapshot:Snapshot;onClose:()=>void;onSnapshot:(s:Snapshot)=>void}){
 const visible=active==='crafting';
 const [data,setData]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState<any>(null);
 async function get(path:string){const r=await fetch(`${apiUrl}${path}`,{headers:authHeaders()});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error??'LOAD_FAILED');return j;}
 async function load(){if(!visible)return;setError('');try{const [recipes,jobs,tree]=await Promise.all([get('/v1/crafting/recipes'),get('/v1/crafting/jobs'),get('/v1/profession-tree')]);setData({...recipes,...jobs,tree});}catch(e:any){setError(errors[e.message]??String(e.message).replaceAll('_',' ').toLowerCase());}}
 async function refreshSnapshot(){const r=await fetch(`${apiUrl}/v1/me/snapshot`,{headers:authHeaders()});if(r.ok)onSnapshot(await r.json());}
 useEffect(()=>{setResult(null);void load();},[active]);
 async function post(path:string){setBusy(true);setError('');setResult(null);try{const r=await fetch(`${apiUrl}${path}`,{method:'POST',headers:actionHeaders(),body:'{}'});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error??'ACTION_FAILED');setResult(j.response??j);await load();await refreshSnapshot();}catch(e:any){setError(errors[e.message]??String(e.message).replaceAll('_',' ').toLowerCase());}finally{setBusy(false)}}
 if(!visible)return null;
 const activeJobs=(data?.jobs??[]).filter((j:any)=>j.status==='running');
 return <section className="module-overlay crafting-premium-overlay">
  <header><div><Hammer/><span><small>OFICIOS DEL NEXO</small><strong>Crafting</strong></span></div><button onClick={onClose}><X/></button></header>
  {error&&<div className="module-error">{error}</div>}
  {result&&<div className="module-success">{result.bonusOutput?'✨ Maestría activada: obtuviste producción adicional.':result.durationSeconds?`Fabricación iniciada · ${duration(result.durationSeconds)} · coste ${result.goldCost} oro`:'Acción completada.'}</div>}
  <section className="crafting-hero"><div><span className="eyebrow">TALENTOS ACTIVOS</span><h2>Forja con maestría</h2><p>Los talentos de profesión reducen el tiempo y el oro de fabricación, y pueden generar producción adicional.</p></div><Sparkles/></section>
  <div className="craft-bonus-strip">{(data?.tree?.professions??[]).map((p:any)=><article key={p.id}><b>{p.name_es}</b><span>Nv. {p.level}</span></article>)}</div>
  <div className="module-section-head"><div><small>COLA DEL TALLER</small><h3>Fabricaciones activas</h3></div><Clock3/></div>
  <div className="premium-craft-jobs">{activeJobs.length===0?<div className="empty-state"><Hammer/><b>Forja disponible</b><span>Elige una receta para comenzar.</span></div>:activeJobs.map((j:any)=>{const ready=new Date(j.finishes_at).getTime()<=Date.now();return <article key={j.id}><div className="craft-job-icon"><Hammer/></div><div><b>{j.name_es}</b><span>{ready?'LISTO PARA RECOGER':`Termina ${new Date(j.finishes_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}`}</span><small>{j.profession_id}</small></div><button disabled={busy||!ready} onClick={()=>post(`/v1/crafting/jobs/${j.id}/claim-enhanced`)}>{ready?'Recoger':'En curso'}</button></article>})}</div>
  <div className="module-section-head"><div><small>RECETARIO</small><h3>Recetas del Nexo</h3></div><BookOpen/></div>
  <div className="premium-recipe-grid">{(data?.recipes??[]).map((r:any)=>{const prof=(data?.tree?.professions??[]).find((p:any)=>p.id===r.profession_id);const allowed=Number(prof?.level??1)>=Number(r.min_profession_level);return <article className={allowed?'available':'locked'} key={r.id}><div className="recipe-art"><Hammer/></div><div className="recipe-head"><div><span className="eyebrow">{r.profession_id} · NV. {r.min_profession_level}</span><b>{r.name_es}</b></div><em>{duration(Number(r.duration_seconds))}</em></div><div className="recipe-cost"><span><Coins/> {r.gold_cost} oro base</span><span><Clock3/> Talentos aplican descuento</span></div><div className="recipe-materials">{(r.ingredients??[]).map((x:any,i:number)=><span key={i}><Package/> {x.quantity} {x.resource}</span>)}</div><div className="recipe-output">{(r.outputs??[]).map((x:any,i:number)=><span key={i}>⚒️ {x.quantity}× {x.item}</span>)}</div><button className="module-primary" disabled={busy||!allowed} onClick={()=>post(`/v1/crafting/${r.id}/start-enhanced`)}>{allowed?'FABRICAR CON TALENTOS':`REQUIERE ${r.profession_id} NV. ${r.min_profession_level}`}</button></article>})}</div>
 </section>;
}
