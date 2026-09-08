import { isHosted, RequestError } from './http';

export async function callResearch(
  path: string,
  method: 'POST' | 'GET',
  accessToken?: string,
  body?: unknown,
): Promise<unknown> {
  let response: Response;
  if (isHosted()) {
    if (!accessToken) throw new RequestError(401, 'Sign in with Valyu to continue.', 'AUTH_REQUIRED');
    const platform = process.env.VALYU_APP_URL || 'https://platform.valyu.ai';
    response = await fetch(`${platform}/api/oauth/proxy`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, method, ...(body ? { body } : {}) }),
      cache: 'no-store',
      signal: AbortSignal.timeout(25000),
    });
  } else {
    const key = process.env.VALYU_API_KEY;
    if (!key) throw new RequestError(503, 'Set VALYU_API_KEY to run your own research.', 'API_KEY_REQUIRED');
    response = await fetch(`https://api.valyu.ai${path}`, {
      method,
      headers: { 'X-API-Key': key, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: 'no-store',
      signal: AbortSignal.timeout(25000),
    });
  }
  if (response.status === 402) throw new RequestError(402, 'Your Valyu account needs credits. Add credits at platform.valyu.ai, then try again.', 'INSUFFICIENT_CREDITS');
  if (response.status === 401 || response.status === 403) throw new RequestError(401, 'Valyu could not authorize this request. Check your account or API key.', 'AUTH_REQUIRED');
  if (response.status === 429) throw new RequestError(429, 'Valyu is handling too many requests. Please wait a moment and try again.', 'RATE_LIMITED');
  if (!response.ok) throw new RequestError(502, 'Valyu could not complete this request. Please try again.', 'PROVIDER_ERROR');
  return response.json();
}
