import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { cookies } from 'next/headers';
import { isHosted, RequestError } from './http';

export const sessionCookieName = 'gfm_session';
export const oauthCookieName = 'gfm_oauth';

export interface AccountUser {
  id: string;
  email?: string;
  aud: string;
  created_at: string;
  app_metadata: { provider: string };
  user_metadata: {
    full_name?: string;
    avatar_url?: string;
    organisation_name?: string;
  };
}

export interface ValyuSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  sessionExpiresAt: number;
  user: AccountUser;
}

function encryptionKey(): Buffer {
  const secret = process.env.VALYU_SESSION_SECRET;
  if (!secret || secret.length < 32)
    throw new RequestError(503, 'Sign-in is not configured.');
  return createHash('sha256').update(secret).digest();
}

export function seal(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), 'utf8'),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString(
    'base64url',
  );
}

export function unseal<T>(value?: string): T | null {
  if (!value || value.length > 12000) return null;
  try {
    const payload = Buffer.from(value, 'base64url');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      encryptionKey(),
      payload.subarray(0, 12),
    );
    decipher.setAuthTag(payload.subarray(12, 28));
    return JSON.parse(
      Buffer.concat([
        decipher.update(payload.subarray(28)),
        decipher.final(),
      ]).toString('utf8'),
    ) as T;
  } catch {
    return null;
  }
}

export function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  };
}

export async function writeSession(session: ValyuSession): Promise<void> {
  const value = seal(session);
  if (value.length > 3900)
    throw new RequestError(503, 'The account session could not be stored.');
  (await cookies()).set(
    sessionCookieName,
    value,
    cookieOptions(
      Math.max(0, Math.floor((session.sessionExpiresAt - Date.now()) / 1000)),
    ),
  );
}

export async function exchangeTokens(
  parameters: Record<string, string>,
): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}> {
  const provider = process.env.NEXT_PUBLIC_VALYU_SUPABASE_URL;
  const clientId = process.env.NEXT_PUBLIC_VALYU_CLIENT_ID;
  const secret = process.env.VALYU_CLIENT_SECRET;
  if (!provider || !clientId || !secret)
    throw new RequestError(503, 'Sign-in is not configured.');
  const response = await fetch(`${provider}/auth/v1/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(parameters),
    cache: 'no-store',
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok)
    throw new RequestError(
      response.status >= 500 ? 503 : 401,
      'Please sign in with Valyu again.',
      'AUTH_REQUIRED',
    );
  const tokens = await response.json();
  if (typeof tokens.access_token !== 'string')
    throw new RequestError(502, 'Valyu did not return a valid session.');
  return tokens;
}

export async function fetchAccountUser(
  accessToken: string,
): Promise<AccountUser> {
  const platform = process.env.VALYU_APP_URL || 'https://platform.valyu.ai';
  const response = await fetch(`${platform}/api/oauth/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok)
    throw new RequestError(
      401,
      'Please sign in with Valyu again.',
      'AUTH_REQUIRED',
    );
  const user = await response.json();
  if (typeof user.sub !== 'string' || !user.sub)
    throw new RequestError(401, 'Valyu did not return a valid account.');
  return {
    id: user.sub,
    ...(typeof user.email === 'string' ? { email: user.email } : {}),
    aud: 'authenticated',
    created_at: new Date().toISOString(),
    app_metadata: { provider: 'valyu' },
    user_metadata: {
      full_name: typeof user.name === 'string' ? user.name : undefined,
      avatar_url: typeof user.picture === 'string' ? user.picture : undefined,
      organisation_name:
        typeof user.valyu_organisation_name === 'string'
          ? user.valyu_organisation_name
          : undefined,
    },
  };
}

const pendingRefreshes = new Map<string, Promise<ValyuSession>>();

export async function getValyuSession(): Promise<ValyuSession | null> {
  const session = unseal<ValyuSession>(
    (await cookies()).get(sessionCookieName)?.value,
  );
  if (
    !session ||
    session.sessionExpiresAt <= Date.now() ||
    !session.user?.id ||
    !session.accessToken
  )
    return null;
  if (session.expiresAt > Date.now() + 60000) return session;
  if (!session.refreshToken) return null;
  const refreshKey = createHash('sha256')
    .update(session.refreshToken)
    .digest('hex');
  let refresh = pendingRefreshes.get(refreshKey);
  if (!refresh) {
    refresh = (async () => {
      const tokens = await exchangeTokens({
        grant_type: 'refresh_token',
        refresh_token: session.refreshToken,
      });
      return {
        ...session,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || session.refreshToken,
        expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000,
      };
    })();
    pendingRefreshes.set(refreshKey, refresh);
  }
  try {
    const refreshed = await refresh;
    await writeSession(refreshed);
    return refreshed;
  } finally {
    pendingRefreshes.delete(refreshKey);
  }
}

export async function requireAccount(): Promise<{
  accessToken?: string;
  email?: string;
}> {
  if (!isHosted()) return { email: process.env.DEEPRESEARCH_ALERT_EMAIL };
  const session = await getValyuSession();
  if (!session)
    throw new RequestError(
      401,
      'Sign in with Valyu to start research.',
      'AUTH_REQUIRED',
    );
  return { accessToken: session.accessToken, email: session.user.email };
}
