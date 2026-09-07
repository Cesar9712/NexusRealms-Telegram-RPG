export type DamageType = 'physical' | 'magic';

export type CombatStats = {
  physicalAttack: number;
  magicAttack: number;
  defense: number;
  magicResistance: number;
  critChance: number;
  critDamage: number;
  accuracy: number;
  evasion: number;
  blockChance: number;
};

export type DamageRolls = {
  hit: number;
  crit: number;
  block: number;
  variance: number;
};

export type DamageResult = {
  damage: number;
  missed: boolean;
  critical: boolean;
  blocked: boolean;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function resolveDamage(input: {
  attacker: CombatStats;
  defender: Pick<CombatStats, 'defense' | 'magicResistance' | 'evasion' | 'blockChance'>;
  type: DamageType;
  powerRatio: number;
  penetration?: number;
  guaranteedCritBonus?: number;
  rolls: DamageRolls;
}): DamageResult {
  const accuracy = clamp(input.attacker.accuracy, 0.5, 1.5);
  const evade = clamp(input.defender.evasion, 0, 0.65);
  const hitChance = clamp(0.92 + (accuracy - 1) * 0.35 - evade, 0.55, 0.995);
  if (input.rolls.hit > hitChance) return { damage: 0, missed: true, critical: false, blocked: false };

  const rawDefense = input.type === 'magic' ? input.defender.magicResistance : input.defender.defense;
  const effectiveDefense = Math.max(0, rawDefense - (input.penetration ?? 0));
  const attack = input.type === 'magic' ? input.attacker.magicAttack : input.attacker.physicalAttack;
  const mitigation = 100 / (100 + effectiveDefense * 2.25);
  const variance = 0.94 + clamp(input.rolls.variance, 0, 1) * 0.12;
  const critical = input.rolls.crit < clamp(input.attacker.critChance + (input.guaranteedCritBonus ?? 0), 0, 0.95);
  const critMultiplier = critical ? Math.max(1.25, input.attacker.critDamage) : 1;
  const blocked = input.rolls.block < clamp(input.defender.blockChance, 0, 0.75);
  const blockMultiplier = blocked ? 0.6 : 1;
  const damage = Math.max(1, Math.round(attack * input.powerRatio * mitigation * variance * critMultiplier * blockMultiplier));
  return { damage, missed: false, critical, blocked };
}

export type EnemyAbility = {
  type: string;
  chance?: number;
  ratio?: number;
  threshold?: number;
};

export function chooseEnemyAction(input: {
  abilities: EnemyAbility[];
  hp: number;
  maxHp: number;
  rng: number;
}): EnemyAbility {
  const hpRatio = input.hp / Math.max(1, input.maxHp);
  const healing = input.abilities.find((ability) => ability.type === 'heal' && hpRatio <= (ability.threshold ?? 0.35));
  if (healing) return healing;

  const special = input.abilities.filter((ability) => ability.type !== 'basic' && ability.type !== 'heal');
  if (special.length && input.rng < 0.42) {
    const index = Math.min(special.length - 1, Math.floor(clamp(input.rng / 0.42, 0, 0.9999) * special.length));
    return special[index];
  }
  return input.abilities.find((ability) => ability.type === 'basic') ?? { type: 'basic', ratio: 1 };
}

export function applyEnemyAbility(input: {
  ability: EnemyAbility;
  enemyHp: number;
  enemyMaxHp: number;
}) {
  if (input.ability.type !== 'heal') return { hp: input.enemyHp, healed: 0 };
  const healed = Math.max(1, Math.round(input.enemyMaxHp * 0.16));
  const hp = Math.min(input.enemyMaxHp, input.enemyHp + healed);
  return { hp, healed: hp - input.enemyHp };
}

export function tickCooldowns(cooldowns: Record<string, number>) {
  return Object.fromEntries(
    Object.entries(cooldowns)
      .map(([id, turns]) => [id, Math.max(0, turns - 1)] as const)
      .filter(([, turns]) => turns > 0),
  );
}
