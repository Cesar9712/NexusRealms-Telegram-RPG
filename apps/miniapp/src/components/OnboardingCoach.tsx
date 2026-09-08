'use client';

import { useEffect, useState } from 'react';
import { ChevronRight, Compass, X } from 'lucide-react';
import type { Snapshot } from './GameHome';

const apiUrl=process.env.NEXT_PUBLIC_API_URL??'http://localhost:3001';
const auth=(json=false)=>({authorization:`Bearer ${sessionStorage.getItem('nr_session')??''}`,...(json?{'content-type':'application/json'}:{})});
const steps=[
 {title:'Tu leyenda comienza',text:'Conoce el reino y entra en tu primer combate.',target:'adventure',cta:'PRIMER COMBATE'},
 {title:'Convierte victoria en poder',text:'Revisa el loot y equipa una pieza útil.',target:'inventory',cta:'ABRIR INVENTARIO'},
 {title:'El Nexo tiene objetivos',text:'Acepta una misión y comprueba su recompensa antes de completarla.',target:'quests',cta:'VER MISIONES'},
 {title:'Tu build importa',text:'Mira atributos, habilidades y puntos de progresión.',target:'progression',cta:'VER ATRIBUTOS'},
 {title:'Construye tu Bastión',text:'La base progresa con costes y timers controlados por servidor.',target:'bastion',cta:'ENTRAR AL BASTIÓN'},
 {title:'Prepárate para jefes',text:'Los jefes, mazmorras y Torre forman el siguiente objetivo de largo plazo.',target:'endgame',cta:'VER ENDGAME'},
 {title:'No luches solo',text:'Busca un clan, contribuye y participa en raids cooperativas.',target:'clan',cta:'ABRIR CLANES'},
 {title:'El mundo cambia',text:'Eventos, Pase, crafting y nuevos reinos mantienen objetivos activos.',target:'events',cta:'VER EVENTOS'},
] as const;

export function OnboardingCoach({snapshot,onNavigate}:{snapshot:Snapshot;onNavigate:(id:string)=>void}){
 const [step,setStep]=useState<number|null>(null),[dismissed,setDismissed]=useState(false);
 useEffect(()=>{void(async()=>{try{const r=await fetch(`${apiUrl}/v1/settings`,{headers:auth()});if(!r.ok)return;const j=await r.json();const s=j.settings;if(!s||s.onboarding_complete){setStep(null);return;}if(Number(snapshot.character?.level??1)>=3||snapshot.inventoryCount>=5){await fetch(`${apiUrl}/v1/onboarding/progress`,{method:'POST',headers:auth(true),body:JSON.stringify({step:8,complete:true})});setStep(null);return;}setStep(Number(s.onboarding_step??0));}catch{}})();},[]);
 async function advance(){if(step===null)return;const next=step+1;const complete=next>=steps.length;void fetch(`${apiUrl}/v1/onboarding/progress`,{method:'POST',headers:auth(true),body:JSON.stringify({step:next,complete})}).catch(()=>{});if(complete){setStep(null);return;}const current=steps[step];setStep(next);onNavigate(current.target);}
 if(step===null||dismissed||step>=steps.length)return null;const s=steps[step];return <aside className="onboarding-coach"><button className="coach-close" onClick={()=>setDismissed(true)} aria-label="Cerrar guía"><X/></button><div className="coach-icon"><Compass/></div><div><span>PASO {step+1}/{steps.length}</span><b>{s.title}</b><p>{s.text}</p><button onClick={advance}>{s.cta}<ChevronRight/></button></div></aside>;
}
