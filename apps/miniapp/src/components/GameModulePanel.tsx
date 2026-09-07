'use client';

import { useEffect, useMemo, useState } from 'react';
import { Backpack, Castle, Hammer, ScrollText, Shield, Sparkles, Swords, Users, X } from 'lucide-react';
import type { Snapshot } from './GameHome';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const authHeaders = (json = false) => ({
  authorization: `Bearer ${sessionStorage.getItem('nr_session') ?? ''}`,
  ...(json ? { 'content-type': 'application/json' } : {}),
});
const keyHeaders = (json = false) => ({ ...authHeaders(json), 'idempotency-key': crypto.randomUUID() });

const signatureSkill: Record<string,string> = {
  warrior:'warrior_cleave', mage:'mage_bolt', archer:'archer_shot', assassin:'assassin_slash',
};

export function GameModulePanel({active,snapshot,onClose,onSnapshot}:{active:string;snapshot:Snapshot;onClose:()=>void;onSnapshot:(s:Snapshot)=>void}){
  const [data,setData]=useState<any>(null); const [busy,setBusy]=useState(false); const [error,setError]=useState('');
  const character=snapshot.character;

  async function load(){
    if(active==='home') return;
    setError('');
    const path=active==='inventory'?'/v1/inventory':active==='quests'?'/v1/quests':active==='bastion'?'/v1/bastion':active==='adventure'?null:null;
    if(!path){setData(null);return;}
    const res=await fetch(`${apiUrl}${path}`,{headers:authHeaders()}); if(!res.ok){setError('No se pudo cargar este módulo.');return;} setData(await res.json());
  }
  useEffect(()=>{void load();},[active]);
  const events=useMemo(()=>Array.isArray(data?.events)?data.events.slice(-6):[],[data]);

  async function startCombat(){setBusy(true);setError('');try{const r=await fetch(`${apiUrl}/v1/combat/start`,{method:'POST',headers:keyHeaders(true),body:'{}'});const j=await r.json();if(!r.ok)throw new Error(j.error);setData(j.response??j);}catch(e:any){setError(e.message??'COMBAT_ERROR');}finally{setBusy(false)}}
  async function combatAction(skillId?:string){const combat=data?.combat??data?.response?.combat;if(!combat?.id)return;setBusy(true);try{const r=await fetch(`${apiUrl}/v1/combat/${combat.id}/action`,{method:'POST',headers:keyHeaders(true),body:JSON.stringify(skillId?{skillId}:{})});const j=await r.json();if(!r.ok)throw new Error(j.error);const state=j.response??j;const log=await fetch(`${apiUrl}/v1/combat/${combat.id}`,{headers:authHeaders()}).then(x=>x.json());setData({...state,...log});if(state.combat?.state!=='active'){const snap=await fetch(`${apiUrl}/v1/me/snapshot`,{headers:authHeaders()}).then(x=>x.json());onSnapshot(snap);}}catch(e:any){setError(e.message??'ACTION_ERROR')}finally{setBusy(false)}}
  async function acceptQuest(id:string){setBusy(true);try{const r=await fetch(`${apiUrl}/v1/quests/${id}/accept`,{method:'POST',headers:keyHeaders()});if(!r.ok)throw new Error('QUEST_ERROR');await load();}catch{setError('No se pudo aceptar la misión.')}finally{setBusy(false)}}
  async function upgradeBuilding(code:string){setBusy(true);try{const r=await fetch(`${apiUrl}/v1/bastion/${code}/upgrade`,{method:'POST',headers:keyHeaders()});const j=await r.json();if(!r.ok)throw new Error(j.error);await load();const snap=await fetch(`${apiUrl}/v1/me/snapshot`,{headers:authHeaders()}).then(x=>x.json());onSnapshot(snap);}catch(e:any){setError(e.message??'UPGRADE_ERROR')}finally{setBusy(false)}}
  async function completeBuilding(code:string){setBusy(true);try{const r=await fetch(`${apiUrl}/v1/bastion/${code}/complete`,{method:'POST',headers:keyHeaders()});const j=await r.json();if(!r.ok)throw new Error(j.error);await load();}catch(e:any){setError(e.message??'NOT_READY')}finally{setBusy(false)}}

  if(active==='home') return null;
  const title=active==='adventure'?'Aventura':active==='inventory'?'Inventario':active==='quests'?'Misiones':active==='bastion'?'Mi Bastión':active==='clan'?'Clan':'Nexo';
  const Icon=active==='adventure'?Swords:active==='inventory'?Backpack:active==='quests'?ScrollText:active==='bastion'?Castle:Users;
  const combat=data?.combat??data?.response?.combat; const enemy=data?.enemy??data?.response?.enemy;

  return <section className="module-overlay" aria-label={title}>
    <header><div><Icon/><span><small>MÓDULO ACTIVO</small><strong>{title}</strong></span></div><button onClick={onClose}><X/></button></header>
    {error&&<div className="module-error">{error}</div>}

    {active==='adventure'&&<div className="combat-module">
      {!combat&&<><div className="combat-stage"><div className="combat-runes"/><div className="player-figure"/><div className="enemy-figure"/><div className="versus">VS</div></div><button className="module-primary" disabled={busy} onClick={startCombat}><Swords/> {busy?'Buscando enemigo…':'INICIAR COMBATE'}</button></>}
      {combat&&<>
        <div className="combat-stage live"><div className="player-figure"/><div className="enemy-figure"/><span className="enemy-name">{enemy?.name_es??combat.enemy_name_es??'Enemigo del Nexo'}</span></div>
        <div className="combat-bars"><label>Héroe <i><b style={{width:`${Math.max(0,Math.min(100,(Number(combat.player_hp)/(character?.hp_max||1))*100))}%`}}/></i><span>{combat.player_hp} HP</span></label><label>Enemigo <i><b style={{width:`${Math.max(0,Math.min(100,(Number(combat.enemy_hp)/(Number(enemy?.max_hp??combat.enemy_max_hp)||1))*100))}%`}}/></i><span>{combat.enemy_hp} HP</span></label></div>
        {combat.state==='active'?<div className="combat-actions"><button disabled={busy} onClick={()=>combatAction()}><Shield/>Ataque</button><button disabled={busy} onClick={()=>combatAction(signatureSkill[character?.class_id??'warrior'])}><Sparkles/>Habilidad</button></div>:<div className={`combat-result ${combat.state}`}>{combat.state==='victory'?'VICTORIA':'DERROTA'}<button onClick={()=>setData(null)}>Continuar</button></div>}
        <div className="combat-log">{events.map((e:any)=><p key={e.id}><b>{e.actor}</b> · {e.event_type} {e.payload?.damage?`— ${e.payload.damage} daño`:''}</p>)}</div>
      </>}
    </div>}

    {active==='inventory'&&<div className="module-list">{(data?.items??[]).length===0?<div className="empty-state"><Backpack/><b>Mochila vacía</b><span>El loot aparecerá aquí.</span></div>:(data.items??[]).map((i:any)=><article key={i.id} className={`rarity-${i.rarity}`}><div className="item-glyph"/><div><b>{i.name_es}</b><span>{i.item_type} · {i.rarity} · +{i.enhancement_level}</span></div>{i.equipped_slot&&<em>{i.equipped_slot}</em>}</article>)}</div>}

    {active==='quests'&&<div className="module-list">{(data?.quests??[]).map((q:any)=><article key={q.id}><ScrollText/><div><b>{q.title_es}</b><span>{q.category} · Nv. {q.min_level}</span><p>{q.description_es}</p></div><button disabled={busy||q.status!=='available'} onClick={()=>acceptQuest(q.id)}>{q.status==='available'?'Aceptar':q.status}</button></article>)}</div>}

    {active==='bastion'&&<div className="bastion-map">{(data?.buildings??[]).map((b:any,index:number)=>{const finish=b.upgrade_finishes_at?new Date(b.upgrade_finishes_at).getTime():0;const ready=finish>0&&finish<=Date.now();return <article key={b.building_code} style={{'--i':index} as any}><div className="building-art"><Castle/></div><b>{b.name_es??b.building_code}</b><span>Nivel {b.level}</span>{b.upgrade_finishes_at?<button disabled={busy||!ready} onClick={()=>completeBuilding(b.building_code)}>{ready?'Completar':'Mejorando…'}</button>:<button disabled={busy} onClick={()=>upgradeBuilding(b.building_code)}><Hammer/> Mejorar</button>}</article>})}</div>}

    {active==='clan'&&<div className="clan-module"><div className="clan-emblem"><Users/></div><h3>{snapshot.clan?`[${snapshot.clan.tag}] ${snapshot.clan.name}`:'Sin clan'}</h3><p>{snapshot.clan?'Base de clan, raid, tesorería y guerras se sincronizan desde servidor.':'Busca o crea un clan para desbloquear progresión cooperativa.'}</p><div className="clan-stats"><span><b>8</b> edificios</span><span><b>Raid</b> cooperativo</span><span><b>PvP</b> temporadas</span></div></div>}
  </section>;
}
