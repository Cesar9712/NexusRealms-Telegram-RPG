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
