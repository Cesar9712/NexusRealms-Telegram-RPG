'use client';

import { useEffect, useMemo, useState } from 'react';
import { Brain, ChevronRight, Crown, Dumbbell, Footprints, HeartPulse, Shield, Sparkles, Swords, WandSparkles, X } from 'lucide-react';
import type { Snapshot } from './GameHome';

const apiUrl=process.env.NEXT_PUBLIC_API_URL??'http://localhost:3001';
const authHeaders=(json=false)=>({authorization:`Bearer ${sessionStorage.getItem('nr_session')??''}`,...(json?{'content-type':'application/json'}:{})});
const actionHeaders=()=>({...authHeaders(true),'idempotency-key':crypto.randomUUID()});
const errorText:Record<string,string>={NO_ATTRIBUTE_POINTS:'No tienes puntos de atributo disponibles.',NO_PROFESSION_POINTS:'No tienes puntos de profesión disponibles.',PROFESSION_LEVEL_REQUIRED:'Tu profesión todavía no tiene el nivel requerido.',TALENT_PREREQUISITE_REQUIRED:'Primero desbloquea el talento anterior.',TALENT_MAXED:'Este talento ya está al máximo.',CHARACTER_REQUIRED:'Necesitas un personaje.',LOAD_FAILED:'No se pudo cargar la progresión. Inténtalo de nuevo.'};
const statMeta={strength:{label:'Fuerza',help:'Aumenta el ataque físico.',icon:Dumbbell},vitality:{label:'Vitalidad',help:'Aumenta defensa y Vida máxima.',icon:HeartPulse},agility:{label:'Agilidad',help:'Mejora velocidad, crítico y esquiva.',icon:Footprints},intelligence:{label:'Inteligencia',help:'Aumenta ataque mágico y Maná máximo.',icon:Brain},luck:{label:'Suerte',help:'Mejora crítico y daño crítico.',icon:Sparkles}} as const;
const tacticMeta={smart:['Inteligente','Se adapta al estado de la pelea.'],balanced:['Equilibrada','Alterna presión y conservación de recursos.'],aggressive:['Agresiva','Prioriza daño y habilidades fuertes.'],defensive:['Defensiva','Conserva recursos y prioriza supervivencia.']} as const;

export function ProgressionPanel({active,snapshot,onClose,onSnapshot}:{active:string;snapshot:Snapshot;onClose:()=>void;onSnapshot:(s:Snapshot)=>void}){
 const visible=active==='progression'||active==='profession-tree';
 const [data,setData]=useState<any>(null),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[selectedProfession,setSelectedProfession]=useState('');
 async function get(path:string){const r=await fetch(`${apiUrl}${path}`,{headers:authHeaders()});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error??'LOAD_FAILED');return j;}
 async function refreshSnapshot(){const r=await fetch(`${apiUrl}/v1/me/snapshot`,{headers:authHeaders()});if(r.ok)onSnapshot(await r.json());}
 async function load(){if(!visible)return;setError('');setLoading(true);try{const j=await get(active==='progression'?'/v1/progression':'/v1/profession-tree');setData(j);if(active==='profession-tree'&&!selectedProfession&&j.professions?.[0]?.id)setSelectedProfession(j.professions[0].id);}catch(e:any){const code=String(e?.message??'LOAD_FAILED');setError(errorText[code]??'No se pudo cargar esta pantalla. Vuelve a intentarlo.');setData(null);}finally{setLoading(false)}}
 useEffect(()=>{setData(null);void load();},[active]);
 async function post(path:string,body?:unknown){setBusy(true);setError('');try{const r=await fetch(`${apiUrl}${path}`,{method:'POST',headers:actionHeaders(),body:JSON.stringify(body??{})});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error??'ACTION_FAILED');await load();await refreshSnapshot();return j;}catch(e:any){const code=String(e?.message??'ACTION_FAILED');setError(errorText[code]??'No se pudo completar la acción.');}finally{setBusy(false)}}
 const selected=useMemo(()=>data?.professions?.find((p:any)=>p.id===selectedProfession)??data?.professions?.[0],[data,selectedProfession]);
 const talents=useMemo(()=>data?.talents?.filter((t:any)=>t.profession_id===(selected?.id??selectedProfession))??[],[data,selected,selectedProfession]);
 if(!visible)return null;
 const levelStart=data?Math.max(0,(Number(data.level)-1)*300):0;
 const levelProgress=data?Math.max(0,Math.min(300,Number(data.experience)-levelStart)):0;
 return <section className="module-overlay progression-overlay">
  <header><div>{active==='progression'?<Crown/>:<Sparkles/>}<span><small>PROGRESIÓN PROFUNDA</small><strong>{active==='progression'?'Atributos y Táctica':'Árbol de Profesiones'}</strong></span></div><button onClick={onClose}><X/></button></header>
  {error&&<div className="module-error">{error}</div>}
  {loading&&!data&&<div className="empty-state"><Sparkles/><b>Cargando progresión…</b><span>Preparando atributos, tácticas y talentos.</span></div>}
  {active==='progression'&&data&&<>
    <section className="progression-hero"><div><span className="eyebrow">NIVEL {data.level}</span><h2>{snapshot.character?.name}</h2><p>{Number(data.experience).toLocaleString()} EXP · siguiente nivel a {Number(data.nextLevelAt).toLocaleString()} EXP</p></div><div className="progression-points"><b>{data.points.available}</b><span>PUNTOS LIBRES</span></div></section>
    <div className="xp-lane"><i style={{width:`${Math.round(levelProgress/300*100)}%`}}/></div>
    <div className="combat-summary"><article><Swords/><span>ATQ Físico</span><b>{data.combat.physicalAttack}</b></article><article><WandSparkles/><span>ATQ Mágico</span><b>{data.combat.magicAttack}</b></article><article><Shield/><span>Defensa</span><b>{data.combat.defense}</b></article><article><Sparkles/><span>Crítico</span><b>{Math.round(Number(data.combat.critChance)*100)}%</b></article></div>
    <div className="module-section-head"><div><small>ESTILO DE COMBATE</small><h3>Táctica automática</h3></div><Brain/></div>
    <div className="tactic-grid">{Object.entries(tacticMeta).map(([id,[label,help]])=><button className={data.tactic===id?'active':''} disabled={busy} onClick={()=>post('/v1/progression/tactic',{tactic:id})} key={id}><b>{label}</b><span>{help}</span>{data.tactic===id&&<em>ACTIVA</em>}</button>)}</div>
    <div className="module-section-head"><div><small>CONSTRUCCIÓN DEL HÉROE</small><h3>Atributos</h3></div><Crown/></div>
    <div className="attribute-grid">{Object.entries(statMeta).map(([id,meta])=>{const Icon=meta.icon;return <article key={id}><div className="attribute-icon"><Icon/></div><div><b>{meta.label} {data.attributes[id]}</b><span>{meta.help}</span><small>Asignados: {data.allocated[id]}</small></div><button disabled={busy||data.points.available<1} onClick={()=>post('/v1/progression/allocate',{stat:id})}>+1</button></article>})}</div>
    <div className="module-section-head"><div><small>ARSENAL DE CLASE</small><h3>{(data.skills??[]).length} habilidades</h3></div><WandSparkles/></div>
    <div className="progression-skills">{(data.skills??[]).map((s:any)=><article key={s.id}><div className="skill-seal"><WandSparkles/></div><div><b>{s.name_es}</b><span>Nv. {s.unlock_level} · {s.mp_cost} MP · CD {s.cooldown_turns}</span><p>{s.description_es||'Habilidad de clase vinculada a tu progresión.'}</p></div><strong>×{Number(s.power_ratio).toFixed(2)}</strong></article>)}</div>
  </>}
  {active==='profession-tree'&&data&&<>
    <section className="tree-hero"><div><span className="eyebrow">PUNTOS GLOBALES</span><h2>Maestría de Oficios</h2><p>Cada nivel de héroe alimenta tus árboles. Los talentos modifican coste, tiempo y rendimiento del crafting.</p></div><div className="progression-points"><b>{data.points.available}</b><span>DISPONIBLES</span></div></section>
    <div className="profession-tabs">{(data.professions??[]).map((p:any)=><button key={p.id} className={(selected?.id??selectedProfession)===p.id?'active':''} onClick={()=>setSelectedProfession(p.id)}><b>{p.name_es}</b><span>Nv. {p.level}</span></button>)}</div>
    {selected&&<section className="profession-summary"><div><span className="eyebrow">PROFESIÓN SELECCIONADA</span><h3>{selected.name_es}</h3></div><b>Nv. {selected.level}</b></section>}
    <div className="talent-tree">{talents.map((t:any,index:number)=>{const rank=Number(t.rank??0),max=Number(t.max_rank??1);const levelOk=Number(selected?.level??1)>=Number(t.required_profession_level??1);const unlocked=rank>0;return <article className={`${unlocked?'unlocked':''} ${!levelOk?'locked':''}`} key={t.id} style={{'--tier':Number(t.tier??1),'--pos':index} as any}><div className="talent-node"><Sparkles/></div><div><span className="eyebrow">RANGO {rank}/{max} · TIER {t.tier}</span><b>{t.name_es}</b><p>{t.description_es}</p><small>Requiere {selected?.name_es} Nv. {t.required_profession_level}</small></div><button disabled={busy||!levelOk||rank>=max||data.points.available<1} onClick={()=>post(`/v1/profession-tree/${t.id}/allocate`)}>{rank>=max?'MAX':<><span>+1</span><ChevronRight/></>}</button></article>})}</div>
  </>}
 </section>;
}
