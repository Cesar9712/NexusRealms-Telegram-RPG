// Lightweight source regression checks; run with: node --test tests/combat-skill-availability.test.mjs
// These guard the UI contract but do not replace browser interaction or typechecking.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/CombatPanel.tsx', import.meta.url), 'utf8');
const skillMapStart = source.indexOf('usable.map((skill:any)=>');
assert.notEqual(skillMapStart, -1, 'combat skill rendering exists');
const skillMapEnd = source.indexOf('})}</div><div className="combat-turn-info">', skillMapStart);
assert.notEqual(skillMapEnd, -1, 'combat skill rendering closes before turn information');
const skillButton = source.slice(skillMapStart, skillMapEnd);

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

test('basic attack and skill reload cannot be triggered during an in-flight action', () => {
  assert.match(source, /className="skill-button basic" disabled=\{busy\} onClick=\{\(\)=>act\(\)\}/);
  assert.match(source, /className="combat-skills-retry" disabled=\{busy\} onClick=\{loadSkills\}/);
});

test('cooldown and mana badges only appear under their respective conditions', () => {
  assert.match(skillButton, /\{cd>0&&<em>\{cd\}<\/em>\}/);
  assert.match(skillButton, /\{lockedMp&&cd===0&&<em>MP<\/em>\}/);
});

test('action handler rejects duplicate submissions and invalid cooldown or mana before posting', () => {
  assert.match(source, /if\(!combat\?\.id\|\|busy\)return/);
  assert.match(source, /if\(skillId&&cd>0\)\{/);
  assert.match(source, /if\(skillId&&num\(combat\.player_mp\)<mp\)\{/);
  assert.match(source, /await post\(`\/v1\/combat\/\$\{combat\.id\}\/action`,skillId\?\{skillId\}:\{\}\)/);
});

test('action retries reuse a single idempotency key', () => {
  assert.match(source, /async function post\(path:string,body:Record<string,unknown>=\{\}\)\{const key=requestKey\(\)/);
  assert.match(source, /for\(let attempt=0;attempt<2;attempt\+\+\)/);
  assert.match(source, /headers:action\(key\)/);
});
