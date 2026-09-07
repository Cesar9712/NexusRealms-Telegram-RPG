import assert from 'node:assert/strict';
import test from 'node:test';
import { applyEnemyAbility, chooseEnemyAction, resolveDamage, tickCooldowns } from './combatEngine.js';

const attacker = {
  physicalAttack: 30,
  magicAttack: 12,
  defense: 10,
  magicResistance: 10,
  critChance: 0.2,
  critDamage: 1.75,
  accuracy: 1,
  evasion: 0,
  blockChance: 0,
};

const defender = { defense: 18, magicResistance: 12, evasion: 0.05, blockChance: 0.1 };

test('damage is positive and deterministic for fixed rolls', () => {
  const result = resolveDamage({ attacker, defender, type: 'physical', powerRatio: 1.3, rolls: { hit: 0.1, crit: 0.9, block: 0.9, variance: 0.5 } });
  assert.equal(result.missed, false);
  assert.equal(result.critical, false);
  assert.ok(result.damage > 0);
  assert.deepEqual(result, resolveDamage({ attacker, defender, type: 'physical', powerRatio: 1.3, rolls: { hit: 0.1, crit: 0.9, block: 0.9, variance: 0.5 } }));
});

test('critical hit increases damage', () => {
  const normal = resolveDamage({ attacker, defender, type: 'physical', powerRatio: 1, rolls: { hit: 0.1, crit: 0.9, block: 0.9, variance: 0.5 } });
  const critical = resolveDamage({ attacker, defender, type: 'physical', powerRatio: 1, rolls: { hit: 0.1, crit: 0.01, block: 0.9, variance: 0.5 } });
  assert.equal(critical.critical, true);
  assert.ok(critical.damage > normal.damage);
});

test('enemy prioritizes healing at low hp', () => {
  const action = chooseEnemyAction({ abilities: [{ type: 'basic' }, { type: 'heal', threshold: 0.35 }], hp: 20, maxHp: 100, rng: 0.9 });
  assert.equal(action.type, 'heal');
  const healed = applyEnemyAbility({ ability: action, enemyHp: 20, enemyMaxHp: 100 });
  assert.ok(healed.hp > 20);
});

test('cooldowns tick down and remove completed entries', () => {
  assert.deepEqual(tickCooldowns({ strike: 1, nova: 3 }), { nova: 2 });
});
