import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

const TelegramUserSchema = z.object({
  id: z.number().int().positive(),
  first_name: z.string().min(1),
  last_name: z.string().optional(),
  username: z.string().optional(),
  language_code: z.string().optional(),
  photo_url: z.string().url().optional(),
});

export type TelegramUser = z.infer<typeof TelegramUserSchema>;

export interface VerifiedTelegramInitData {
  user: TelegramUser;
  authDate: number;
  queryId?: string;
  startParam?: string;
}

function parseInitData(initData: string) {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) {
    throw new Error('Invalid Telegram hash');
  }

  const dataCheckString = [...params.entries()]
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  return { params, hash: hash.toLowerCase(), dataCheckString };
}

export function verifyTelegramInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds = 300,
  nowSeconds = Math.floor(Date.now() / 1000),
): VerifiedTelegramInitData {
  const { params, hash, dataCheckString } = parseInitData(initData);

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calculated = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const expectedBuffer = Buffer.from(hash, 'hex');
  const actualBuffer = Buffer.from(calculated, 'hex');
  if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) {
    throw new Error('Telegram initData signature mismatch');
  }

  const authDate = Number(params.get('auth_date'));
  if (!Number.isInteger(authDate) || authDate <= 0) {
    throw new Error('Missing Telegram auth_date');
  }
  if (authDate > nowSeconds + 30 || nowSeconds - authDate > maxAgeSeconds) {
    throw new Error('Expired Telegram initData');
  }

  const rawUser = params.get('user');
  if (!rawUser) throw new Error('Missing Telegram user');

  const user = TelegramUserSchema.parse(JSON.parse(rawUser));
  return {
    user,
    authDate,
    queryId: params.get('query_id') ?? undefined,
    startParam: params.get('start_param') ?? undefined,
  };
}

export function signTelegramInitDataForTest(
  values: Record<string, string>,
  botToken: string,
): string {
  const dataCheckString = Object.entries(values)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  const params = new URLSearchParams(values);
  params.set('hash', hash);
  return params.toString();
}
