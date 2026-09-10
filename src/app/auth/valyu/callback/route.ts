import { timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { appOrigin } from '@/lib/server/http';
import {
  cookieOptions,
  exchangeTokens,
  fetchAccountUser,
  oauthCookieName,
  unseal,
  writeSession,
} from '@/lib/server/valyu-session';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const destination = new URL('/', appOrigin(request));
  const cookieStore = await cookies();
  const pending = unseal<{
    state: string;
    verifier: string;
    redirectUri: string;
    expiresAt: number;
  }>(cookieStore.get(oauthCookieName)?.value);
  cookieStore.set(oauthCookieName, '', cookieOptions(0));
  const parameters = new URL(request.url).searchParams;
  const state = parameters.get('state') || '';
  const code = parameters.get('code');
  if (
    parameters.has('error') ||
    !code ||
    !pending ||
    pending.expiresAt < Date.now() ||
    Buffer.byteLength(state) !== Buffer.byteLength(pending.state) ||
    !timingSafeEqual(Buffer.from(state), Buffer.from(pending.state))
  ) {
    destination.searchParams.set(
      'auth_error',
      'Sign-in could not be verified. Please try again.',
    );
    return NextResponse.redirect(destination);
  }
  try {
    const tokens = await exchangeTokens({
      grant_type: 'authorization_code',
      code,
      code_verifier: pending.verifier,
      redirect_uri: pending.redirectUri,
    });
    const user = await fetchAccountUser(tokens.access_token);
    await writeSession({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || '',
      expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000,
      sessionExpiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
      user,
    });
  } catch {
    destination.searchParams.set(
      'auth_error',
      'Sign-in did not complete. Please try again.',
    );
  }
  return NextResponse.redirect(destination, {
    headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
  });
}
