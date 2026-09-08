'use client';

import { BowArrow, ChevronRight, Crown, Gauge, HeartPulse, Shield, Sparkles, Swords, UserRound, Zap } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Snapshot } from './GameHome';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

type ClassId = 'warrior' | 'mage' | 'archer' | 'assassin';

type HeroClass = {
  id: ClassId;
  name: string;
  role: string;
  epithet: string;
  description: string;
  hp: number;
  damage: number;
  speed: number;
  difficulty: string;
  specialty: string;
  icon: typeof Shield;
};

const classes: HeroClass[] = [
  { id: 'warrior', name: 'Guerrero', role: 'Vanguardia', epithet: 'Escudo del Reino', description: 'Domina el frente de batalla con armadura pesada, bloqueo y golpes demoledores.', hp: 95, damage: 72, speed: 52, difficulty: 'Fácil', specialty: 'Defensa y control', icon: Shield },
  { id: 'mage', name: 'Mago', role: 'Arcanista', epithet: 'Heraldo Arcano', description: 'Canaliza magia elemental para controlar el combate y desatar daño devastador.', hp: 56, damage: 98, speed: 64, difficulty: 'Media', specialty: 'Magia y control', icon: Sparkles },
  { id: 'archer', name: 'Arquero', role: 'Tirador', epithet: 'Ojo del Viento', description: 'Mantén la distancia, encadena críticos y castiga al enemigo antes de que se acerque.', hp: 69, damage: 85, speed: 91, difficulty: 'Media', specialty: 'Crítico y precisión', icon: BowArrow },
  { id: 'assassin', name: 'Asesino', role: 'Sombra', epithet: 'Filo Nocturno', description: 'Ataca desde las sombras con evasión, combos rápidos y explosiones de daño crítico.', hp: 62, damage: 94, speed: 100, difficulty: 'Alta', specialty: 'Combo y evasión', icon: Swords },
];

function MiniBar({ value }: { value: number }) {
  return <span className="creation-mini-track"><i style={{ width: `${value}%` }} /></span>;
}

function StatRow({ label, value, icon: Icon }: { label: string; value: number; icon: typeof HeartPulse }) {
  return (
    <div className="creation-stat">
      <span className="stat-icon"><Icon size={14} /></span>
      <span className="stat-label">{label}</span>
      <MiniBar value={value} />
      <strong>{value}</strong>
    </div>
  );
}

export function CharacterCreation({ onCreated }: { onCreated: (snapshot: Snapshot) => void }) {
  const [classId, setClassId] = useState<ClassId>('warrior');
  const [name, setName] = useState('');
  const [body, setBody] = useState<'masculine' | 'feminine'>('masculine');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = useMemo(() => classes.find((item) => item.id === classId) ?? classes[0], [classId]);
  const SelectedIcon = selected.icon;

  async function createHero() {
    const token = sessionStorage.getItem('nr_session');
    if (!token || name.trim().length < 3) {
      setError('Escribe un nombre de al menos 3 caracteres.');
      return;
    }

    setBusy(true);
    setError(null);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20_000);

    try {
      const response = await fetch(`${apiUrl}/v1/characters`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
          'idempotency-key': crypto.randomUUID(),
        },
        body: JSON.stringify({
          name: name.trim(),
          classId,
          appearance: { body, face: 'origin-01', hair: 'origin-01', hairColor: 'obsidian' },
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'CREATE_FAILED');
      onCreated(data.snapshot as Snapshot);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') {
        setError('El servidor tardó demasiado. Vuelve a intentarlo.');
      } else {
        setError(cause instanceof Error && cause.message === 'CHARACTER_ALREADY_EXISTS' ? 'Ya existe un héroe para esta cuenta.' : 'No se pudo forjar el héroe. Inténtalo de nuevo.');
      }
    } finally {
      window.clearTimeout(timeout);
      setBusy(false);
    }
  }

  return (
    <main className={`creation-shell creation-${selected.id}`}>
      <div className="creation-aurora" />
      <div className="creation-stars" aria-hidden="true" />

      <header className="creation-header">
        <span className="eyebrow"><Crown size={12} /> DESPERTAR DEL NEXO</span>
        <h1>Forja tu leyenda</h1>
        <p>Elige tu clase inicial. Tu estilo de combate, especializaciones y equipo evolucionarán desde esta decisión.</p>
      </header>

      <section className="class-carousel" aria-label="Clases iniciales">
        {classes.map((item) => {
          const Icon = item.icon;
          const active = item.id === classId;
          return (
            <button key={item.id} className={`class-card ${active ? 'active' : ''}`} onClick={() => setClassId(item.id)} aria-pressed={active}>
              <span className="class-emblem"><Icon /></span>
              <span className="class-name">{item.name}</span>
              <small>{item.role}</small>
              {active && <span className="class-selected-dot" aria-hidden="true" />}
            </button>
          );
        })}
      </section>

      <section className="class-stage">
        <div className="stage-vignette" />
        <div className="class-rings"><i /><i /><i /></div>
        <div className="portrait-runes"><i>✦</i><i>◆</i><i>✧</i></div>

        <div className="class-avatar-wrap" aria-hidden="true">
          <div className="portrait-halo" />
          <div className="portrait-crest"><SelectedIcon /></div>
          <div className="class-avatar-art">
            <div className="avatar-cape" />
            <div className="avatar-shoulder left" />
            <div className="avatar-shoulder right" />
            <div className="class-head"><span /></div>
            <div className="avatar-hair" />
            <div className="class-body"><span className="avatar-core" /></div>
            <div className="avatar-arm left" />
            <div className="avatar-arm right" />
            <div className="class-weapon primary" />
            <div className="class-weapon secondary" />
          </div>
        </div>

        <div className="class-stage-copy">
          <span className="eyebrow">{selected.role.toUpperCase()}</span>
          <h2>{selected.name}</h2>
          <div className="class-epithet">{selected.epithet}</div>
          <p>{selected.description}</p>
          <div className="class-meta">
            <span><Gauge size={12} /> {selected.difficulty}</span>
            <span><Zap size={12} /> {selected.specialty}</span>
          </div>
          <div className="creation-stats">
            <StatRow label="Supervivencia" value={selected.hp} icon={HeartPulse} />
            <StatRow label="Daño" value={selected.damage} icon={Swords} />
            <StatRow label="Velocidad" value={selected.speed} icon={Zap} />
          </div>
        </div>
      </section>

      <section className="identity-form panel">
        <div className="form-heading">
          <div>
            <span className="eyebrow">IDENTIDAD</span>
            <h3>Da nombre a tu héroe</h3>
          </div>
          <span className="form-step">PASO FINAL</span>
        </div>

        <label className="hero-name-field">
          <span>Nombre del héroe</span>
          <div className="input-shell">
            <UserRound size={17} />
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={24} placeholder="Ej. Kael Nightfall" autoComplete="off" />
            <small>{name.length}/24</small>
          </div>
        </label>

        <div className="appearance-label">Apariencia base</div>
        <div className="body-choice" role="group" aria-label="Apariencia base">
          <button className={body === 'masculine' ? 'active' : ''} onClick={() => setBody('masculine')}>
            <span className="choice-icon"><UserRound size={17} /></span>
            <span><strong>Tipo A</strong><small>Silueta robusta</small></span>
          </button>
          <button className={body === 'feminine' ? 'active' : ''} onClick={() => setBody('feminine')}>
            <span className="choice-icon"><UserRound size={17} /></span>
            <span><strong>Tipo B</strong><small>Silueta ágil</small></span>
          </button>
        </div>

        {error && <div className="creation-error">{error}</div>}

        <button className="primary-cta creation-submit" onClick={createHero} disabled={busy}>
          {busy ? (
            <><span className="forge-spinner" /> FORJANDO HÉROE…</>
          ) : (
            <>COMENZAR AVENTURA <ChevronRight size={19} /></>
          )}
        </button>
        <p className="creation-footnote">La clase podrá especializarse más adelante. Tu progreso quedará guardado en el servidor.</p>
      </section>
    </main>
  );
}
