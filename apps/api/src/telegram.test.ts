import assert from 'node:assert/strict';
import test from 'node:test';
import { signTelegramInitDataForTest, verifyTelegramInitData } from './telegram.js';

const botToken = '123456789:TEST_TOKEN_FOR_SIGNATURE_VALIDATION_ONLY';
const now = 1_800_000_000;
const user = JSON.stringify({ id: 987654321, first_name: 'Cesar', username: 'player' });

test('accepts correctly signed fresh Telegram initData', () => {
  const initData = signTelegramInitDataForTest({ auth_date: String(now - 10), query_id: 'q1', user }, botToken);
  const verified = verifyTelegramInitData(initData, botToken, 300, now);
  assert.equal(verified.user.id, 987654321);
  assert.equal(verified.queryId, 'q1');
});

test('rejects tampered Telegram initData', () => {
  const initData = signTelegramInitDataForTest({ auth_date: String(now - 10), user }, botToken)
    .replace('player', 'attacker');
  assert.throws(() => verifyTelegramInitData(initData, botToken, 300, now));
});

test('rejects stale Telegram initData', () => {
  const initData = signTelegramInitDataForTest({ auth_date: String(now - 301), user }, botToken);
  assert.throws(() => verifyTelegramInitData(initData, botToken, 300, now), /Expired/);
});
