'use client';

import { useEffect, useState } from 'react';
import { Ban, Coins, Search, ShieldCheck, UserRoundCog } from 'lucide-react';

const apiUrl=process.env.NEXT_PUBLIC_API_URL??'http://localhost:3001';
const h=()=>({authorization:`Bearer ${sessionStorage.getItem('nr_session')??''}`,'content-type':'application/json'});

export function AdminPanel(){
 const [ready,setReady]=useState(false),[error,setError]=useState(''),[overview,setOverview]=useState<any>(null),[players,setPlayers]=useState<any[]>([]),[q,setQ]=useState('');
 async function authenticate(){const existing=sessionStorage.getItem('nr_session');if(existing){setReady(true);return;}const initData=window.Telegram?.WebApp?.initData;if(!initData){setError('Abre el panel desde Telegram.');return;}const r=await fetch(`${apiUrl}/v1/auth/telegram`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({initData})});const j=await r.json();if(!r.ok){setError('Autenticación fallida.');return;}sessionStorage.setItem('nr_session',j.token);setReady(true);}
 useEffect(()=>{void authenticate()},[]);
 useEffect(()=>{if(!ready)return;fetch(`${apiUrl}/v1/admin/overview`,{headers:h()}).then(async r=>{const j=await r.json();if(!r.ok)throw new Error('FORBIDDEN');setOverview(j.stats)}).catch(()=>setError('Tu Telegram ID no está autorizado como administrador.'));},[ready]);
 async function search(){const r=await fetch(`${apiUrl}/v1/admin/players?q=${encodeURIComponent(q)}`,{headers:h()});const j=await r.json();if(r.ok)setPlayers(j.players??[]);}
 async function ban(p:any){await fetch(`${apiUrl}/v1/admin/players/${p.id}/ban`,{method:'POST',headers:h(),body:JSON.stringify({banned:!p.is_banned,reason:'admin_panel'})});await search();}
 async function gold(p:any){const raw=prompt('Cantidad de oro a sumar (negativo para retirar):','100');if(!raw)return;const amount=Number(raw);if(!Number.isFinite(amount))return;await fetch(`${apiUrl}/v1/admin/players/${p.id}/grant`,{method:'POST',headers:h(),body:JSON.stringify({currency:'gold',amount,reason:'admin_panel'})});}
 if(error)return <main className="admin-shell"><ShieldCheck/><h1>Panel administrativo</h1><p>{error}</p></main>;
 if(!ready||!overview)return <main className="admin-shell"><ShieldCheck/><h1>Panel administrativo</h1><p>Validando acceso…</p></main>;
 return <main className="admin-shell"><header><div><ShieldCheck/><span><small>PRIVADO · AUDITADO</small><h1>Nexus Control</h1></span></div></header><section className="admin-kpis">{Object.entries(overview).map(([k,v])=><article key={k}><b>{String(v)}</b><span>{k.replaceAll('_',' ')}</span></article>)}</section><section className="admin-card"><h2><UserRoundCog/> Jugadores</h2><div className="admin-search"><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Nombre, usuario o Telegram ID"/><button onClick={search}><Search/>Buscar</button></div><div className="admin-players">{players.map(p=><article key={p.id}><div><b>{p.character_name??p.display_name}</b><span>@{p.username??'sin_usuario'} · Nv. {p.level??'-'} · Poder {p.power??0}</span></div><button onClick={()=>gold(p)}><Coins/>Oro</button><button className={p.is_banned?'unban':'danger'} onClick={()=>ban(p)}><Ban/>{p.is_banned?'Activar':'Suspender'}</button></article>)}</div></section><p className="admin-note">Todas las modificaciones de recursos, suspensiones y configuración quedan registradas en el audit log del servidor.</p></main>;
}
