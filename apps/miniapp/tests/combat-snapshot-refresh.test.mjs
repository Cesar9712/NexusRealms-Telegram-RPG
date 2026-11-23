// Regression guard: snapshot refresh is secondary to accepted combat actions.
// Source-level contract only; browser and network failure tests remain necessary.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/CombatPanel.tsx', import.meta.url), 'utf8');

test('snapshot refresh absorbs network failures after accepted combat actions', () => {
  const start = source.indexOf('async function refreshSnapshot()');
  const end = source.indexOf('async function loadSkills()', start);
  assert.ok(start >= 0 && end > start, 'snapshot refresh helper is present');
  const helper = source.slice(start, end);
  assert.match(helper, /try\s*\{/);
  assert.match(helper, /await fetch\(/);
  assert.match(helper, /catch\s*\{/);
  assert.match(helper, /onSnapshot\(await r\.json\(\)\)/);
});

test('start and abandon still request a best-effort snapshot update', () => {
  const start = source.slice(source.indexOf('async function start()'), source.indexOf('async function abandon()'));
  const abandon = source.slice(source.indexOf('async function abandon()'), source.indexOf('async function act('));
  assert.match(start, /await refreshSnapshot\(\)/);
  assert.match(abandon, /await refreshSnapshot\(\)/);
});

test('terminal combat actions refresh snapshot without discarding the accepted action', () => {
  const actStart = source.indexOf('async function act(');
  const actEnd = source.indexOf('if(!visible)return null;', actStart);
  assert.ok(actStart >= 0 && actEnd > actStart, 'combat action handler is present');
  const handler = source.slice(actStart, actEnd);
  assert.match(handler, /const response=await post\(/);
  assert.match(handler, /setState\(\(old:any\)=>\(\{\.\.\.old,\.\.\.response,resumed:false\}\)\)/);
  assert.match(handler, /if\(response\.combat\?\.state!=='active'\)await refreshSnapshot\(\)/);
});


test('combat POST retains one idempotency key across retry attempts', () => {
  const start = source.indexOf('async function post(');
  const end = source.indexOf('async function refreshSnapshot()', start);
  assert.ok(start >= 0 && end > start, 'combat POST helper is present');
  const helper = source.slice(start, end);
  assert.match(helper, /const key=requestKey\(\);let last:unknown=null;for\(let attempt=0;attempt<2;attempt\+\+\)/);
  assert.match(helper, /headers:action\(key\)/);
  assert.match(helper, /if\(e\?\.server\)throw e/);
});
