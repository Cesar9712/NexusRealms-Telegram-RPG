'use client';

import { BowArrow, ChevronRight, Shield, Sparkles, Swords } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Snapshot } from './GameHome';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

type ClassId = 'warrior' | 'mage' | 'archer' | 'assassin';

const classes: Array<{
  id: ClassId;
  name: string;
  role: string;
  description: string;
  hp: number;
  damage: number;
  speed: number;
  icon: typeof Shield;
}> = [
  { id: 'warrior', name: 'Guerrero', role: 'Vanguardia', description: 'Alta vida, bloqueo y dominio cuerpo a cuerpo.', hp: 95, damage: 70, speed: 52, icon: Shield },
  { id: 'mage', name: 'Mago', role: 'Arcanista', description: 'Daño mágico, control y poder elemental devastador.', hp: 55, damage: 98, speed: 62, icon: Sparkles },
  { id: 'archer', name: 'Arquero', role: 'Tirador', description: 'Críticos, precisión y velocidad a distancia.', hp: 68, damage: 84, speed: 89, icon: BowArrow },
  { id: 'assassin', name: 'Asesino', role: 'Sombra', description: 'Evasión, combos y ráfagas de daño crítico.', hp: 61, damage: 93, speed: 100, icon: Swords },
];

function MiniBar({ value }: { value: number }) {
  return <span className="creation-mini-track"><i style={{ width: `${value}%` }} /></span>;
}

export function CharacterCreation({ onCreated }: { onCreated: (snapshot: Snapshot) => void }) {
  const [classId, setClassId] = useState<ClassId>('warrior');
  const [name, setName] = useState('');
  const [body, setBody] = useState<'masculine' | 'feminine'>('masculine');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = useMemo(() => classes.find((item) => item.id === classId) ?? classes[0], [classId]);

  async function createHero() {
    const token = sessionStorage.getItem('nr_session');
    if (!token || name.trim().length < 3) {
      setError('Escribe un nombre de al menos 3 caracteres.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`${apiUrl}/v1/characters`, {
        method: 'POST',
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
      setError(cause instanceof Error && cause.message === 'CHARACTER_ALREADY_EXISTS' ? 'Ya existe un héroe para esta cuenta.' : 'No se pudo forjar el héroe. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="creation-shell">
      <div className="creation-aurora" />
      <header className="creation-header">
        <span className="eyebrow">DESPERTAR DEL NEXO</span>
        <h1>Forja tu leyenda</h1>
        <p>Elige una senda. Tus habilidades, especializaciones y equipo evolucionarán desde esta decisión.</p>
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
            </button>
          );
        })}
      </section>

      <section className={`class-stage class-${selected.id}`}>
        <div className="class-rings"><i /><i /><i /></div>
        <div className="class-avatar-art">
          <div className="class-head" />
          <div className="class-body" />
          <div className="class-weapon" />
        </div>
        <div className="class-stage-copy">
          <span className="eyebrow">{selected.role.toUpperCase()}</span>
          <h2>{selected.name}</h2>
          <p>{selected.description}</p>
          <div className="creation-stat"><span>Supervivencia</span><MiniBar value={selected.hp} /></div>
          <div className="creation-stat"><span>Daño</span><MiniBar value={selected.damage} /></div>
          <div className="creation-stat"><span>Velocidad</span><MiniBar value={selected.speed} /></div>
        </div>
      </section>

      <section className="identity-form panel">
        <label>
          <span>Nombre del héroe</span>
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={24} placeholder="Ej. Kael Nightfall" autoComplete="off" />
        </label>
        <div className="body-choice" role="group" aria-label="Apariencia base">
          <button className={body === 'masculine' ? 'active' : ''} onClick={() => setBody('masculine')}>Tipo A</button>
          <button className={body === 'feminine' ? 'active' : ''} onClick={() => setBody('feminine')}>Tipo B</button>
        </div>
        {error && <div className="creation-error">{error}</div>}
        <button className="primary-cta creation-submit" onClick={createHero} disabled={busy}>
          {busy ? 'FORJANDO HÉROE…' : <>COMENZAR AVENTURA <ChevronRight size={18} /></>}
        </button>
      </section>
    </main>
  );
}
