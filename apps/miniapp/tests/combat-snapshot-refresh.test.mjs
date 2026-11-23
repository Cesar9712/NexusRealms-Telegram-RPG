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

test('failed active-combat lookup blocks starting a second encounter and offers retry', () => {
  const lookup = source.slice(source.indexOf('async function loadActiveCombat()'), source.indexOf('useEffect('));
  assert.match(lookup, /setActiveCheckFailed\(true\)/);
  assert.match(lookup, /setActiveCheckFailed\(false\)/);
  const ui = source.slice(source.indexOf('if(!visible)return null;'));
  assert.match(ui, /:activeCheckFailed\?<div/);
  assert.match(ui, /onClick=\{\(\)=>void loadActiveCombat\(\)\}/);
  assert.ok(ui.indexOf(':activeCheckFailed?<div') < ui.indexOf(':!combat?<div'), 'failure gate precedes start controls');
});


test('successful lookup alone clears the active-combat failure gate', () => {
  const start = source.indexOf('async function loadActiveCombat()');
  const end = source.indexOf('useEffect(', start);
  assert.ok(start >= 0 && end > start, 'active combat lookup is present');
  const lookup = source.slice(start, end);
  const catchStart = lookup.indexOf('}catch(');
  assert.ok(catchStart > 0, 'lookup has an error handler');
  assert.match(lookup.slice(0, catchStart), /setActiveCheckFailed\(false\)/);
  assert.doesNotMatch(lookup.slice(catchStart), /setActiveCheckFailed\(false\)/);
  assert.match(lookup.slice(catchStart), /setActiveCheckFailed\(true\)/);
});
