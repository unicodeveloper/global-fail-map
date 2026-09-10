import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  appOrigin,
  errorResponse,
  isHosted,
  RequestError,
} from '@/lib/server/http';
import {
  cookieOptions,
  oauthCookieName,
  seal,
} from '@/lib/server/valyu-session';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    if (!isHosted()) return NextResponse.redirect(new URL('/', request.url));
    const provider = process.env.NEXT_PUBLIC_VALYU_SUPABASE_URL;
    const clientId = process.env.NEXT_PUBLIC_VALYU_CLIENT_ID;
    if (!provider || !clientId)
      throw new RequestError(503, 'Valyu sign-in is not configured.');
    const state = randomBytes(24).toString('base64url');
    const verifier = randomBytes(32).toString('base64url');
    const redirectUri = `${appOrigin(request)}/auth/valyu/callback`;
    (await cookies()).set(
      oauthCookieName,
      seal({ state, verifier, redirectUri, expiresAt: Date.now() + 600000 }),
      cookieOptions(600),
    );
    const authorization = new URL(`${provider}/auth/v1/oauth/authorize`);
    authorization.search = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      state,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'consent',
      utm_source: new URL(redirectUri).host,
    }).toString();
    return NextResponse.redirect(authorization, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
