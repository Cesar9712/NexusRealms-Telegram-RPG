// Lightweight source regression checks; run with: node --test tests/combat-skill-availability.test.mjs
// These guard the UI contract but do not replace browser interaction or typechecking.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/CombatPanel.tsx', import.meta.url), 'utf8');
const skillButton = source.slice(source.indexOf('usable.map((skill:any)=>'));
assert.ok(skillButton.length > 100, 'combat skill rendering exists');

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

test('successful combat actions survive a history refresh failure', () => {
  assert.match(source, /log=await get\(`\/v1\/combat\/\$\{combat\.id\}`\)/);
  assert.match(source, /combat:log\?\.combat\?\?response\.combat\?\?old\?\.combat/);
  assert.match(source, /if\(log\)setEvents\(log\.events\?\?\[\]\)/);
});
