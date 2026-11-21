// Lightweight source regression checks; run with: node --test tests/combat-skill-availability.test.mjs
// These guard the UI contract but do not replace browser interaction or typechecking.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/CombatPanel.tsx', import.meta.url), 'utf8');
const skillMapStart = source.indexOf('usable.map((skill:any)=>');
assert.notEqual(skillMapStart, -1, 'combat skill rendering exists');
const skillButton = source.slice(skillMapStart);

test('skills remain disabled when cooling down or lacking mana', () => {
  assert.match(skillButton, /unavailable=cd>0\|\|lockedMp/);
  assert.match(skillButton, /disabled=\{busy\|\|unavailable\}/);
});

test('disabled skills expose a readable reason and the remaining cost', () => {
  assert.match(skillButton, /aria-label=\{/);
  assert.match(skillButton, /en enfriamiento durante/);
  assert.match(skillButton, /maná insuficiente/);
  assert.match(skillButton, /Espera \$\{cd\} turno/);
  assert.match(skillButton, /Faltan \$\{mp-num\(combat\.player_mp\)\} MP/);
});

test('available skills still invoke their action', () => {
  assert.match(skillButton, /onClick=\{\(\)=>act\(skill\)\}/);
});
