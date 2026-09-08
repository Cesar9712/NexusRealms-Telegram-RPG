'use client';

import { useEffect, useState } from 'react';
import { CloudOff, LoaderCircle } from 'lucide-react';

export function NetworkStatus(){
 const [pending,setPending]=useState(0),[online,setOnline]=useState(true);
 useEffect(()=>{setOnline(navigator.onLine);const network=(e:Event)=>setPending(Number((e as CustomEvent).detail?.pending??0));const on=()=>setOnline(true),off=()=>setOnline(false);window.addEventListener('nr-network',network);window.addEventListener('online',on);window.addEventListener('offline',off);return()=>{window.removeEventListener('nr-network',network);window.removeEventListener('online',on);window.removeEventListener('offline',off)}} ,[]);
 if(!online)return <div className="network-status offline"><CloudOff/>Sin conexión · las acciones se reintentarán cuando vuelva la red</div>;
 if(pending>0)return <div className="network-status loading"><LoaderCircle/>Sincronizando {pending>1?`${pending} acciones`:'acción'}…</div>;
 return null;
}
