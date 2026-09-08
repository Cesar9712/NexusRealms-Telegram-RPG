'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Archive,
  Castle,
  Clock3,
  Coins,
  FlaskConical,
  Flower2,
  Hammer,
  Landmark,
  LoaderCircle,
  Mountain,
  Pickaxe,
  Shield,
  ShoppingBasket,
  Sparkles,
  Swords,
  TowerControl,
  Waves,
  Warehouse,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Snapshot } from './GameHome';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const auth = () => ({ authorization: `Bearer ${sessionStorage.getItem('nr_session') ?? ''}` });
const action = () => ({ ...auth(), 'idempotency-key': crypto.randomUUID() });
const num = (value: unknown) => Number(value ?? 0);

type DistrictId = 'core' | 'production' | 'development' | 'power';
type BuildingZone = 'citadel' | 'craft' | 'arcane' | 'nature' | 'resource' | 'utility' | 'military';

type BuildingMeta = {
  name: string;
  Icon: LucideIcon;
  zone: BuildingZone;
  district: DistrictId;
  order: number;
  benefit: string;
};

type BastionBuilding = {
  building_code: string;
  name_es?: string | null;
  level: number | string;
  max_level: number | string;
  upgrade_finishes_at?: string | null;
  production_resource?: string | null;
  base_production_per_hour?: number | string | null;
  base_upgrade_seconds?: number | string | null;
  base_gold_cost?: number | string | null;
};

type BastionData = {
  serverTime: string;
  syncedAt: number;
  buildings: BastionBuilding[];
};

const districts: Array<{ id: DistrictId; eyebrow: string; name: string; description: string }> = [
  { id: 'core', eyebrow: 'NÚCLEO', name: 'Mando del Bastión', description: 'Progreso general y prestigio de tu héroe.' },
  { id: 'production', eyebrow: 'RECURSOS', name: 'Producción', description: 'Recoge materiales generados con el reloj del servidor.' },
  { id: 'development', eyebrow: 'DESARROLLO', name: 'Artesanía y comercio', description: 'Mejora la creación, la capacidad y el intercambio.' },
  { id: 'power', eyebrow: 'PODER', name: 'Arcano y defensa', description: 'Bendiciones, expediciones, magia y viajes.' },
];

const labels: Record<string, BuildingMeta> = {
  fortress: { name: 'Fortaleza', Icon: Castle, zone: 'citadel', district: 'core', order: 1, benefit: 'Desbloqueos globales' },
  'hall-of-heroes': { name: 'Salón de Héroes', Icon: Shield, zone: 'citadel', district: 'core', order: 2, benefit: 'Prestigio del héroe' },
  mine: { name: 'Mina', Icon: Pickaxe, zone: 'resource', district: 'production', order: 3, benefit: 'Extracción de mineral' },
  garden: { name: 'Jardín', Icon: Flower2, zone: 'nature', district: 'production', order: 4, benefit: 'Cosecha de hierbas' },
  pond: { name: 'Estanque', Icon: Waves, zone: 'nature', district: 'production', order: 5, benefit: 'Producción de peces' },
  forge: { name: 'Herrería', Icon: Hammer, zone: 'craft', district: 'development', order: 6, benefit: 'Creación más rápida' },
  laboratory: { name: 'Laboratorio', Icon: FlaskConical, zone: 'arcane', district: 'development', order: 7, benefit: 'Alquimia más rápida' },
  workshop: { name: 'Taller', Icon: Archive, zone: 'craft', district: 'development', order: 8, benefit: 'Calidad de fabricación' },
  warehouse: { name: 'Almacén', Icon: Warehouse, zone: 'utility', district: 'development', order: 9, benefit: 'Mayor capacidad' },
  market: { name: 'Mercado', Icon: ShoppingBasket, zone: 'utility', district: 'development', order: 10, benefit: 'Menos impuestos' },
  altar: { name: 'Altar', Icon: Sparkles, zone: 'arcane', district: 'power', order: 11, benefit: 'Bendiciones temporales' },
  barracks: { name: 'Cuartel', Icon: Swords, zone: 'military', district: 'power', order: 12, benefit: 'Más expediciones' },
  'arcane-tower': { name: 'Torre Arcana', Icon: TowerControl, zone: 'arcane', district: 'power', order: 13, benefit: 'Regeneración de maná' },
  portal: { name: 'Portal', Icon: Landmark, zone: 'arcane', district: 'power', order: 14, benefit: 'Viajes más baratos' },
};

const resourceLabels: Record<string, string> = {
  iron_ore: 'hierro',
  essence: 'esencia',
  herbs: 'hierbas',
  ore: 'mineral',
  fish: 'peces',
  arcane_dust: 'polvo arcano',
};

const errors: Record<string, string> = {
  INSUFFICIENT_GOLD: 'No tienes suficiente oro.',
  INSUFFICIENT_RESOURCES: 'Te faltan materiales.',
  ALREADY_UPGRADING: 'Ese edificio ya se está mejorando.',
  UPGRADE_RUNNING: 'Ese edificio ya se está mejorando.',
  NOTHING_TO_COLLECT: 'Todavía no hay producción disponible.',
  NOT_PRODUCING: 'Este edificio no genera recursos.',
  NOT_READY: 'La mejora aún no ha terminado.',
  NO_UPGRADE: 'Este edificio no tiene una mejora activa.',
  MAX_LEVEL: 'El edificio ya alcanzó su nivel máximo.',
  LOAD_FAILED: 'No se pudo cargar el Bastión. Inténtalo de nuevo.',
  ACTION_FAILED: 'No se pudo completar la acción. Inténtalo de nuevo.',
};

const human = (value: string) => errors[value] ?? value.replaceAll('_', ' ').toLowerCase();

function remaining(iso: string | null | undefined, serverNow: number) {
  if (!iso) return '';
  const ms = new Date(iso).getTime() - serverNow;
  if (ms <= 0) return 'LISTO';
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1_000);
  return hours ? `${hours}h ${minutes}m` : minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function duration(seconds: number) {
  if (seconds >= 3_600) {
    const hours = Math.floor(seconds / 3_600);
    const minutes = Math.ceil((seconds % 3_600) / 60);
    return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  if (seconds >= 60) return `${Math.ceil(seconds / 60)}m`;
  return `${Math.max(1, Math.ceil(seconds))}s`;
}

function fallbackMeta(building: BastionBuilding): BuildingMeta {
  return {
    name: building.name_es ?? building.building_code,
    Icon: Castle,
    zone: 'utility',
    district: 'development',
    order: 999,
    benefit: 'Mejora del Bastión',
  };
}

export function BastionPanel({
  active,
  snapshot,
  onClose,
  onSnapshot,
}: {
  active: string;
  snapshot: Snapshot;
  onClose: () => void;
  onSnapshot: (snapshot: Snapshot) => void;
}) {
  const visible = active === 'bastion';
  const panelRef = useRef<HTMLElement>(null);
  const [data, setData] = useState<BastionData | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [clockTick, setClockTick] = useState(0);

  async function load() {
    if (!visible) return;
    setError('');
    try {
      const response = await fetch(`${apiUrl}/v1/bastion`, { headers: auth() });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        serverTime?: string;
        buildings?: BastionBuilding[];
      };
      if (!response.ok) throw new Error(payload.error ?? 'LOAD_FAILED');
      setData({
        serverTime: payload.serverTime ?? new Date().toISOString(),
        syncedAt: performance.now(),
        buildings: Array.isArray(payload.buildings) ? payload.buildings : [],
      });
    } catch (caught) {
      setError(human(caught instanceof Error ? caught.message : 'LOAD_FAILED'));
    }
  }

  async function refreshSnapshot() {
    const response = await fetch(`${apiUrl}/v1/me/snapshot`, { headers: auth() });
    if (response.ok) onSnapshot(await response.json());
  }

  useEffect(() => {
    void load();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    panelRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    setClockTick(performance.now());
    const id = window.setInterval(() => setClockTick(performance.now()), 1_000);
    return () => window.clearInterval(id);
  }, [visible]);

  async function post(code: string, kind: 'upgrade' | 'complete' | 'collect') {
    setBusy(`${code}:${kind}`);
    setError('');
    try {
      const response = await fetch(`${apiUrl}/v1/bastion/${code}/${kind}`, {
        method: 'POST',
        headers: action(),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'ACTION_FAILED');
      await Promise.all([load(), refreshSnapshot()]);
    } catch (caught) {
      setError(human(caught instanceof Error ? caught.message : 'ACTION_FAILED'));
    } finally {
      setBusy('');
    }
  }

  if (!visible) return null;

  const buildings = [...(data?.buildings ?? [])].sort(
    (left, right) => (labels[left.building_code]?.order ?? 999) - (labels[right.building_code]?.order ?? 999),
  );
  const serverNow = data
    ? new Date(data.serverTime).getTime() + Math.max(0, clockTick - data.syncedAt)
    : Date.now();
  const upgrading = buildings.filter(
    (building) => building.upgrade_finishes_at && remaining(building.upgrade_finishes_at, serverNow) !== 'LISTO',
  ).length;
  const producing = buildings.filter(
    (building) => building.production_resource && num(building.base_production_per_hour) > 0,
  ).length;

  return (
    <section ref={panelRef} className="module-overlay bastion-premium-overlay" aria-label="Bastión">
      <header>
        <div>
          <Castle />
          <span>
            <small>BASE PERSONAL</small>
            <strong>Mi Bastión</strong>
          </span>
        </div>
        <button type="button" onClick={onClose} aria-label="Cerrar Bastión">
          <X />
        </button>
      </header>

      {error && (
        <div className="module-error" role="alert">
          {error}
        </div>
      )}

      {!data ? (
        <div className="bastion-loading">
          <LoaderCircle />
          <b>Cartografiando tu Bastión…</b>
        </div>
      ) : (
        <>
          <section className="bastion-overview" aria-label="Resumen del Bastión">
            <div className="bastion-overview-copy">
              <small>FORTALEZA DEL HÉROE</small>
              <h2>{snapshot.character?.name}</h2>
              <p>Administra todos tus edificios, recoge recursos y controla las mejoras desde un solo lugar.</p>
            </div>
            <div className="bastion-stats">
              <span>
                <Castle />
                <b>{buildings.length}</b>
                <small>edificios</small>
              </span>
              <span>
                <Hammer />
                <b>{upgrading}</b>
                <small>mejorando</small>
              </span>
              <span>
                <Mountain />
                <b>{producing}</b>
                <small>productores</small>
              </span>
            </div>
          </section>

          <div className="bastion-directory">
            <small>DISTRITOS DEL BASTIÓN</small>
            <h2>Todos tus edificios</h2>
            <p>Ningún edificio está oculto. Cada tarjeta muestra su nivel, beneficio, producción y próxima mejora.</p>
          </div>

          <div className="bastion-districts">
            {districts.map((district) => {
              const districtBuildings = buildings.filter((building) => {
                const meta = labels[building.building_code] ?? fallbackMeta(building);
                return meta.district === district.id;
              });
              if (!districtBuildings.length) return null;

              return (
                <section className={`bastion-district district-${district.id}`} key={district.id}>
                  <header className="bastion-district-heading">
                    <div>
                      <small>{district.eyebrow}</small>
                      <h3>{district.name}</h3>
                      <p>{district.description}</p>
                    </div>
                    <span>{districtBuildings.length}</span>
                  </header>

                  <div className="bastion-building-grid">
                    {districtBuildings.map((building) => {
                      const meta = labels[building.building_code] ?? fallbackMeta(building);
                      const Icon = meta.Icon;
                      const level = num(building.level);
                      const maxLevel = Math.max(1, num(building.max_level));
                      const isMaxLevel = level >= maxLevel;
                      const time = remaining(building.upgrade_finishes_at, serverNow);
                      const ready = time === 'LISTO';
                      const production = Boolean(building.production_resource) && num(building.base_production_per_hour) > 0;
                      const productionRate = num(building.base_production_per_hour) * Math.max(1, level);
                      const nextCost = Math.round(num(building.base_gold_cost) * Math.pow(1.32, Math.max(0, level - 1)));
                      const nextSeconds = Math.round(num(building.base_upgrade_seconds) * Math.pow(1.18, Math.max(0, level - 1)));
                      const titleId = `bastion-building-${building.building_code}`;
                      const collectBusy = busy === `${building.building_code}:collect`;
                      const upgradeBusy = busy === `${building.building_code}:upgrade`;
                      const completeBusy = busy === `${building.building_code}:complete`;

                      return (
                        <article
                          className={`bastion-building zone-${meta.zone} ${building.upgrade_finishes_at ? 'upgrading' : ''}`}
                          key={building.building_code}
                          aria-labelledby={titleId}
                          aria-busy={collectBusy || upgradeBusy || completeBusy}
                        >
                          <div className="building-card-head">
                            <span className="building-emblem" aria-hidden="true">
                              <Icon />
                            </span>
                            <div className="building-title">
                              <h4 id={titleId}>{building.name_es ?? meta.name}</h4>
                              <span>Nivel {level} de {maxLevel}</span>
                            </div>
                            <span className={`building-state ${ready ? 'ready' : building.upgrade_finishes_at ? 'active' : ''}`}>
                              {building.upgrade_finishes_at ? (
                                <>
                                  <Clock3 /> {time}
                                </>
                              ) : isMaxLevel ? (
                                'MÁXIMO'
                              ) : (
                                'ACTIVO'
                              )}
                            </span>
                          </div>

                          <p className="building-benefit">{meta.benefit}</p>

                          <div className="building-level-track" aria-label={`Progreso de nivel: ${level} de ${maxLevel}`}>
                            <i style={{ width: `${Math.min(100, (level / maxLevel) * 100)}%` }} />
                          </div>

                          <div className="building-meta">
                            <span>
                              <Sparkles />
                              <span>
                                <small>{production ? 'PRODUCCIÓN' : 'BENEFICIO'}</small>
                                <b>
                                  {production
                                    ? `${productionRate}/h · ${resourceLabels[building.production_resource ?? ''] ?? building.production_resource}`
                                    : meta.benefit}
                                </b>
                              </span>
                            </span>
                            <span>
                              {isMaxLevel ? <Shield /> : <Coins />}
                              <span>
                                <small>{isMaxLevel ? 'ESTADO' : 'PRÓXIMA MEJORA'}</small>
                                <b>{isMaxLevel ? 'Nivel máximo' : `${nextCost.toLocaleString('es-ES')} oro · ${duration(nextSeconds)}`}</b>
                              </span>
                            </span>
                          </div>

                          <div className={`building-actions ${production && !building.upgrade_finishes_at ? '' : 'single-action'}`}>
                            {production && !building.upgrade_finishes_at && (
                              <button
                                type="button"
                                disabled={Boolean(busy)}
                                onClick={() => post(building.building_code, 'collect')}
                                aria-label={`Recoger producción de ${building.name_es ?? meta.name}`}
                              >
                                {collectBusy ? <LoaderCircle className="button-spinner" /> : <Sparkles />}
                                {collectBusy ? 'RECOGIENDO' : 'RECOGER'}
                              </button>
                            )}
                            {building.upgrade_finishes_at ? (
                              <button
                                type="button"
                                className={ready ? 'ready' : ''}
                                disabled={Boolean(busy) || !ready}
                                onClick={() => post(building.building_code, 'complete')}
                              >
                                {completeBusy ? <LoaderCircle className="button-spinner" /> : <Clock3 />}
                                {completeBusy ? 'COMPLETANDO' : ready ? 'COMPLETAR MEJORA' : time}
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={Boolean(busy) || isMaxLevel}
                                onClick={() => post(building.building_code, 'upgrade')}
                                aria-label={`Mejorar ${building.name_es ?? meta.name} por ${nextCost} de oro`}
                              >
                                {upgradeBusy ? <LoaderCircle className="button-spinner" /> : <Hammer />}
                                {upgradeBusy ? 'MEJORANDO' : isMaxLevel ? 'NIVEL MÁXIMO' : 'MEJORAR'}
                              </button>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>

          <section className="bastion-regeneration" aria-label="Regeneración del héroe">
            <header>
              <div>
                <small>RELOJ DEL SERVIDOR</small>
                <h3>Regeneración del héroe</h3>
              </div>
              <Clock3 />
            </header>
            <div>
              <HeartStat label="HP" value={snapshot.character?.hp} max={snapshot.character?.hp_max} seconds={120} />
              <HeartStat label="MP" value={snapshot.character?.mp} max={snapshot.character?.mp_max} seconds={90} />
              <HeartStat label="ENERGÍA" value={snapshot.character?.energy} max={snapshot.character?.energy_max} seconds={180} />
            </div>
            <p>Entrar al Bastión no restaura nada al instante. Los tiempos se calculan con el servidor.</p>
          </section>
        </>
      )}
    </section>
  );
}

function HeartStat({
  label,
  value,
  max,
  seconds,
}: {
  label: string;
  value?: number;
  max?: number;
  seconds: number;
}) {
  const current = num(value);
  const maximum = num(max);
  const percentage = Math.max(0, Math.min(100, (current / Math.max(1, maximum)) * 100));

  return (
    <span>
      <span className="regeneration-label">
        <b>{label}</b>
        <strong>{current}/{maximum}</strong>
      </span>
      <i>
        <em style={{ width: `${percentage}%` }} />
      </i>
      <small>+1 cada {seconds}s</small>
    </span>
  );
}
