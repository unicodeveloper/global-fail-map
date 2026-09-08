import { cookies } from 'next/headers';
import { assertSameOrigin, errorResponse, isHosted, json } from '@/lib/server/http';
import { cookieOptions, getValyuSession, oauthCookieName, sessionCookieName } from '@/lib/server/valyu-session';

export const runtime = 'nodejs';

export async function GET() {
  try {
    if (!isHosted()) return json({ user: null, mode: 'self-hosted' });
    const session = await getValyuSession();
    return json({ user: session?.user || null, mode: 'valyu' });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const store = await cookies();
    store.set(sessionCookieName, '', cookieOptions(0));
    store.set(oauthCookieName, '', cookieOptions(0));
    return json({ success: true });
  } catch (error) {
    return errorResponse(error);
  }
}
