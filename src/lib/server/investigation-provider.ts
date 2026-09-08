import { isHosted, RequestError } from './http';

export async function callResearch(
  path: string,
  method: 'POST' | 'GET',
  accessToken?: string,
  body?: unknown,
): Promise<unknown> {
  let response: Response;
  if (isHosted()) {
    if (!accessToken)
      throw new RequestError(
        401,
        'Sign in with Valyu to continue.',
        'AUTH_REQUIRED',
      );
    const platform = process.env.VALYU_APP_URL || 'https://platform.valyu.ai';
    response = await fetch(`${platform}/api/oauth/proxy`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path, method, ...(body ? { body } : {}) }),
      cache: 'no-store',
      signal: AbortSignal.timeout(25000),
    });
  } else {
    const key = process.env.VALYU_API_KEY;
    if (!key)
      throw new RequestError(
        503,
        'Set VALYU_API_KEY to run your own research.',
        'API_KEY_REQUIRED',
      );
    response = await fetch(`https://api.valyu.ai${path}`, {
      method,
      headers: { 'X-API-Key': key, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: 'no-store',
      signal: AbortSignal.timeout(25000),
    });
  }
  if (response.status === 402)
    throw new RequestError(
      402,
      'Your Valyu account needs credits. Add credits at platform.valyu.ai, then try again.',
      'INSUFFICIENT_CREDITS',
    );
  if (response.status === 401 || response.status === 403)
    throw new RequestError(
      401,
      'Valyu could not authorize this request. Check your account or API key.',
      'AUTH_REQUIRED',
    );
  if (response.status === 429)
    throw new RequestError(
      429,
      'Valyu is handling too many requests. Please wait a moment and try again.',
      'RATE_LIMITED',
    );
  if (!response.ok)
    throw new RequestError(
      502,
      'Valyu could not complete this request. Please try again.',
      'PROVIDER_ERROR',
    );
  return response.json();
}

export async function getPublicResearch(id: string): Promise<unknown> {
  const platform = process.env.VALYU_APP_URL || 'https://platform.valyu.ai';
  const response = await fetch(
    `${platform}/api/deepresearch/tasks/${encodeURIComponent(id)}/public-view`,
    {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(25000),
    },
  );
  if ([401, 403, 404].includes(response.status)) {
    throw new RequestError(
      404,
      'This shared research report is not available.',
      'NOT_FOUND',
    );
  }
  if (response.status === 429) {
    throw new RequestError(
      429,
      'Valyu is handling too many requests. Please wait a moment and try again.',
      'RATE_LIMITED',
    );
  }
  if (!response.ok) {
    throw new RequestError(
      502,
      'Valyu could not load this shared research report.',
      'PROVIDER_ERROR',
    );
  }
  const result = await response.json();
  const task =
    result &&
    typeof result === 'object' &&
    !Array.isArray(result) &&
    (result as Record<string, unknown>).success === true
      ? (result as Record<string, unknown>).data
      : null;
  if (
    !task ||
    typeof task !== 'object' ||
    Array.isArray(task) ||
    (task as Record<string, unknown>).public !== true
  ) {
    throw new RequestError(
      404,
      'This shared research report is not available.',
      'NOT_FOUND',
    );
  }
  return task;
}
