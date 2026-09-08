import { isResearchTaskId, sharedResearchUrl } from '@/lib/research-links';
import {
  appOrigin,
  assertSameOrigin,
  errorResponse,
  json,
  readJson,
  RequestError,
} from '@/lib/server/http';
import { callResearch } from '@/lib/server/investigation-provider';
import { requireAccount } from '@/lib/server/valyu-session';

export const runtime = 'nodejs';
export const maxDuration = 60;

function task(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RequestError(
      502,
      'Valyu returned an unexpected research response.',
      'PROVIDER_ERROR',
    );
  }
  return value as Record<string, unknown>;
}

function isGlobalFailMapTask(value: Record<string, unknown>): boolean {
  const metadata =
    value.metadata && typeof value.metadata === 'object'
      ? (value.metadata as Record<string, unknown>)
      : {};
  return (
    metadata.app === 'global-fail-map' ||
    (typeof value.query === 'string' &&
      value.query.startsWith('Research target:'))
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const { id } = await context.params;
    if (!isResearchTaskId(id)) {
      throw new RequestError(
        400,
        'This research task ID is invalid.',
        'INVALID_INPUT',
      );
    }
    const body = await readJson(request);
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      typeof (body as Record<string, unknown>).public !== 'boolean' ||
      Object.keys(body).some((key) => key !== 'public')
    ) {
      throw new RequestError(
        400,
        'Choose whether this report should be public.',
        'INVALID_INPUT',
      );
    }
    const makePublic = (body as { public: boolean }).public;
    const account = await requireAccount();
    const current = task(
      await callResearch(
        `/v1/deepresearch/tasks/${id}/status`,
        'GET',
        account.accessToken,
      ),
    );
    if (!isGlobalFailMapTask(current)) {
      throw new RequestError(
        404,
        'This research report is not available.',
        'NOT_FOUND',
      );
    }
    await callResearch(
      `/v1/deepresearch/tasks/${id}/public`,
      'POST',
      account.accessToken,
      { public: makePublic },
    );
    return json({
      public: makePublic,
      shareUrl: makePublic ? sharedResearchUrl(appOrigin(request), id) : null,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
