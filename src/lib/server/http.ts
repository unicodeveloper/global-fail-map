import { NextResponse } from 'next/server';

export class RequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = 'REQUEST_FAILED',
  ) {
    super(message);
  }
}

export function isHosted(): boolean {
  return process.env.NEXT_PUBLIC_APP_MODE === 'valyu';
}

export function appOrigin(request: Request): string {
  return new URL(process.env.NEXT_PUBLIC_APP_URL || request.url).origin;
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  if (
    (origin &&
      origin !== appOrigin(request) &&
      origin !== new URL(request.url).origin) ||
    fetchSite === 'cross-site'
  ) {
    throw new RequestError(
      403,
      'This request must come from this app.',
      'INVALID_ORIGIN',
    );
  }
}

export async function readJson(request: Request): Promise<unknown> {
  if (Number(request.headers.get('content-length') || 0) > 16000) {
    throw new RequestError(413, 'The request is too large.');
  }
  const body = await request.text();
  if (body.length > 16000)
    throw new RequestError(413, 'The request is too large.');
  try {
    return JSON.parse(body);
  } catch {
    throw new RequestError(400, 'Send a valid JSON request.');
  }
}

export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof RequestError) {
    return json({ error: error.code, message: error.message }, error.status);
  }
  return json(
    {
      error: 'SERVER_ERROR',
      message: 'Something interrupted this request. Please try again.',
    },
    500,
  );
}
