import { investigationFromTask } from '@/lib/fail-map-types';
import { isResearchTaskId } from '@/lib/research-links';
import { errorResponse, json, RequestError } from '@/lib/server/http';
import { getPublicResearch } from '@/lib/server/investigation-provider';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    if (!isResearchTaskId(id)) {
      throw new RequestError(
        400,
        'This research task ID is invalid.',
        'INVALID_INPUT',
      );
    }
    const result = (await getPublicResearch(id)) as Record<string, unknown>;
    const metadata =
      result.metadata && typeof result.metadata === 'object'
        ? (result.metadata as Record<string, unknown>)
        : {};
    if (
      metadata.app !== 'global-fail-map' &&
      !(
        typeof result.query === 'string' &&
        result.query.startsWith('Research target:')
      )
    ) {
      throw new RequestError(
        404,
        'This shared research report is not available.',
        'NOT_FOUND',
      );
    }
    return json({ investigation: investigationFromTask(result), shared: true });
  } catch (error) {
    return errorResponse(error);
  }
}
