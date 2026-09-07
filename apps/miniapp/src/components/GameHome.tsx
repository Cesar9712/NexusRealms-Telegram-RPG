'use client';

import {
  Backpack,
  Castle,
  ChevronRight,
  CircleUserRound,
  Coins,
  Crown,
  Gem,
  Map as MapIcon,
  ScrollText,
  Shield,
  Sparkles,
  Swords,
  Trophy,
  Users,
  Zap,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

type Snapshot = {
  serverTime: string;
  player: { display_name: string; username?: string | null };
  character: {
    name: string;
    class_id: string;
    current_realm_id: string;
    level: number;
    experience: number;
    hp: number;
    hp_max: number;
    mp: number;
    mp_max: number;
    energy: number;
    energy_max: number;
    power: number;
  };
  clan: { name: string; tag: string; role: string } | null;
  battlePass: { level: number; xp: number; premium_unlocked: boolean } | null;
  referral: { referral_code: string } | null;
  earn: { internal_credits: number };
  inventoryCount: number;
  resources: Array<{ resource_code: string; amount: number }>;
};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string;
        ready: () => void;
        expand: () => void;
        setHeaderColor?: (color: string) => void;
        setBackgroundColor?: (color: string) => void;
      };
    };
  }
}

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const previewSnapshot: Snapshot = {
  serverTime: new Date().toISOString(),
  player: { display_name: 'Valdris' },
  character: {
    name: 'Valdris Nightfall', class_id: 'warrior', current_realm_id: 'ashen-frontier', level: 7,
    experience: 1840, hp: 132, hp_max: 140, mp: 58, mp_max: 70, energy: 82, energy_max: 100, power: 1284,
  },
  clan: { name: 'Custodios del Nexo', tag: 'NEX', role: 'member' },
  battlePass: { level: 4, xp: 360, premium_unlocked: false },
  referral: { referral_code: 'nexus9712' },
  earn: { internal_credits: 150 },
  inventoryCount: 23,
  resources: [
    { resource_code: 'gold', amount: 1480 },
    { resource_code: 'crystals', amount: 32 },
    { resource_code: 'premium_credits', amount: 0 },
  ],
};

function meter(value: number, max: number) {
  return `${Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100))}%`;
}

export function GameHome() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'telegram-required'>('loading');
  const [travelBusy, setTravelBusy] = useState(false);
  const [activeNav, setActiveNav] = useState('home');

  useEffect(() => {
    const webApp = window.Telegram?.WebApp;
    webApp?.ready();
    webApp?.expand();
    webApp?.setHeaderColor?.('#09070d');
    webApp?.setBackgroundColor?.('#09070d');

    const initData = webApp?.initData;
    if (!initData) {
      if (process.env.NODE_ENV === 'development') {
        setSnapshot(previewSnapshot);
        setStatus('ready');
      } else {
        setStatus('telegram-required');
      }
      return;
    }

    fetch(`${apiUrl}/v1/auth/telegram`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ initData }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('AUTH_FAILED');
        return response.json();
      })
      .then((data: { token: string; snapshot: Snapshot }) => {
        sessionStorage.setItem('nr_session', data.token);
        setSnapshot(data.snapshot);
        setStatus('ready');
      })
      .catch(() => setStatus('error'));
  }, []);

  const resourceMap = useMemo(
    () => new globalThis.Map(snapshot?.resources.map((r) => [r.resource_code, Number(r.amount)]) ?? []),
    [snapshot],
  );

  async function travelTo(realmId: string) {
    const token = sessionStorage.getItem('nr_session');
    if (!token) return;
    setTravelBusy(true);
    try {
      const response = await fetch(`${apiUrl}/v1/realms/${realmId}/travel`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'idempotency-key': crypto.randomUUID(),
        },
      });
      if (!response.ok) throw new Error('TRAVEL_FAILED');
      const data = await response.json();
      setSnapshot(data.snapshot);
    } finally {
      setTravelBusy(false);
    }
  }

  if (status !== 'ready' || !snapshot) {
    return (
      <main className="gate-shell">
        <div className="sigil" />
        <h1>NEXUS REALMS</h1>
        <p>{status === 'telegram-required' ? 'Abre el juego desde Telegram para autenticar tu héroe.' : status === 'error' ? 'No se pudo validar la sesión. Vuelve a abrir el juego desde Telegram.' : 'Sincronizando el reino…'}</p>
      </main>
    );
  }

  const c = snapshot.character;

  return (
    <main className="game-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <header className="topbar">
        <div className="avatar-frame"><CircleUserRound size={28} /></div>
        <div className="identity">
          <span className="eyebrow">NIVEL {c.level} · {c.class_id.toUpperCase()}</span>
          <strong>{c.name}</strong>
        </div>
        <div className="power"><Crown size={15} /><span>{Number(c.power).toLocaleString()}</span></div>
      </header>

      <section className="vitals panel">
        <div className="vital-row"><span>HP</span><div className="track"><i className="hp" style={{ width: meter(c.hp, c.hp_max) }} /></div><b>{c.hp}/{c.hp_max}</b></div>
        <div className="vital-row"><span>MP</span><div className="track"><i className="mp" style={{ width: meter(c.mp, c.mp_max) }} /></div><b>{c.mp}/{c.mp_max}</b></div>
        <div className="vital-row"><span><Zap size={13} /> EN</span><div className="track"><i className="energy" style={{ width: meter(c.energy, c.energy_max) }} /></div><b>{c.energy}/{c.energy_max}</b></div>
      </section>

      <section className="realm-hero">
        <div className="rune-orbit"><span /><span /><span /></div>
        <div className="realm-copy">
          <span className="eyebrow">REINO ACTUAL</span>
          <h1>Frontera de Ceniza</h1>
          <p>Las ruinas del Nexo despiertan. Una brecha arcana consume los bosques del este.</p>
        </div>
        <div className="hero-silhouette">
          <div className="blade" />
          <div className="cape" />
        </div>
        <button className="primary-cta" onClick={() => setActiveNav('adventure')}>
          <Swords size={19} /> CONTINUAR AVENTURA <ChevronRight size={18} />
        </button>
      </section>

      <section className="currency-strip panel">
        <div><Coins size={17} /><span>Oro</span><b>{(resourceMap.get('gold') ?? 0).toLocaleString()}</b></div>
        <div><Gem size={17} /><span>Cristales</span><b>{(resourceMap.get('crystals') ?? 0).toLocaleString()}</b></div>
        <div><Sparkles size={17} /><span>Earn</span><b>{Number(snapshot.earn.internal_credits).toLocaleString()}</b></div>
      </section>

      <section className="section-block">
        <div className="section-title"><div><span className="eyebrow">PROGRESIÓN</span><h2>Tu leyenda</h2></div><Trophy size={20} /></div>
        <div className="feature-grid">
          <button className="feature-card" onClick={() => setActiveNav('bastion')}><Castle /><span><b>Bastión</b><small>Fortaleza Nv. 1</small></span><ChevronRight /></button>
          <button className="feature-card" onClick={() => setActiveNav('clan')}><Users /><span><b>{snapshot.clan?.tag ? `[${snapshot.clan.tag}] ${snapshot.clan.name}` : 'Clan'}</b><small>{snapshot.clan ? 'Base y raid disponibles' : 'Encuentra aliados'}</small></span><ChevronRight /></button>
          <button className="feature-card" onClick={() => setActiveNav('inventory')}><Backpack /><span><b>Inventario</b><small>{snapshot.inventoryCount} objetos</small></span><ChevronRight /></button>
          <button className="feature-card" onClick={() => setActiveNav('quests')}><ScrollText /><span><b>Misiones</b><small>Historia · Diarias · Clan</small></span><ChevronRight /></button>
        </div>
      </section>

      <section className="section-block world-card panel">
        <div>
          <span className="eyebrow">MAPA DEL NEXO</span>
          <h2>Reinos conectados</h2>
          <p>Tu progreso global permanece intacto al viajar. El siguiente umbral está abierto desde nivel 6.</p>
        </div>
        <button disabled={travelBusy || c.current_realm_id === 'cursed-grove'} onClick={() => travelTo('cursed-grove')}>
          <MapIcon size={18} /> {c.current_realm_id === 'cursed-grove' ? 'Bosque Maldito activo' : travelBusy ? 'Abriendo portal…' : 'Viajar al Bosque Maldito'}
        </button>
      </section>

      <div className="active-drawer">{activeNav === 'home' ? 'Nexo sincronizado' : `Módulo seleccionado: ${activeNav}`}</div>

      <nav className="bottom-nav" aria-label="Navegación principal">
        <button className={activeNav === 'home' ? 'active' : ''} onClick={() => setActiveNav('home')}><Shield /><span>Inicio</span></button>
        <button className={activeNav === 'adventure' ? 'active' : ''} onClick={() => setActiveNav('adventure')}><Swords /><span>Aventura</span></button>
        <button className={activeNav === 'inventory' ? 'active' : ''} onClick={() => setActiveNav('inventory')}><Backpack /><span>Equipo</span></button>
        <button className={activeNav === 'bastion' ? 'active' : ''} onClick={() => setActiveNav('bastion')}><Castle /><span>Bastión</span></button>
        <button className={activeNav === 'clan' ? 'active' : ''} onClick={() => setActiveNav('clan')}><Users /><span>Clan</span></button>
      </nav>
    </main>
  );
}
