import { investigationFromTask } from '@/lib/fail-map-types';
import { errorResponse, json, RequestError } from '@/lib/server/http';
import { callResearch } from '@/lib/server/investigation-provider';
import { requireAccount } from '@/lib/server/valyu-session';

export const runtime = 'nodejs';
export const maxDuration = 60;

const taskIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    if (!taskIdPattern.test(id))
      throw new RequestError(
        400,
        'This research task ID is invalid.',
        'INVALID_INPUT',
      );
    const account = await requireAccount();
    const result = await callResearch(
      `/v1/deepresearch/tasks/${id}/status`,
      'GET',
      account.accessToken,
    );
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      throw new RequestError(
        502,
        'Valyu returned an unexpected research response.',
        'PROVIDER_ERROR',
      );
    }
    return json({
      investigation: investigationFromTask(result as Record<string, unknown>),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
