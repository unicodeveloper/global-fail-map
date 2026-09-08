import { buildInvestigationPrompt, investigationFromTask, investigationInputSchema } from '@/lib/fail-map-types';
import { assertSameOrigin, errorResponse, json, readJson, RequestError } from '@/lib/server/http';
import { callResearch } from '@/lib/server/investigation-provider';
import { requireAccount } from '@/lib/server/valyu-session';

export const runtime = 'nodejs';
export const maxDuration = 60;

function asTask(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RequestError(502, 'Valyu returned an unexpected research response.', 'PROVIDER_ERROR');
  }
  return value as Record<string, unknown>;
}

export async function GET() {
  try {
    const account = await requireAccount();
    const result = await callResearch('/v1/deepresearch/list?limit=50', 'GET', account.accessToken);
    if (!Array.isArray(result)) throw new RequestError(502, 'Valyu returned an unexpected research history.', 'PROVIDER_ERROR');
    const investigations = result
      .map(asTask)
      .filter((task) => typeof task.query === 'string' && task.query.startsWith('Research target:'))
      .map((task) => investigationFromTask(task));
    return json({ investigations });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const account = await requireAccount();
    const parsed = investigationInputSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new RequestError(400, 'Choose a valid location and category, with instructions under 2,000 characters.', 'INVALID_INPUT');
    const input = parsed.data;
    const result = asTask(await callResearch('/v1/deepresearch/tasks', 'POST', account.accessToken, {
      query: buildInvestigationPrompt(input),
      mode: 'fast',
      output_formats: ['markdown'],
      metadata: {
        app: 'global-fail-map',
        location: input.location.name,
        latitude: input.location.latitude,
        longitude: input.location.longitude,
        category: input.category,
      },
    }));
    if (typeof result.deepresearch_id !== 'string') {
      throw new RequestError(502, 'Valyu did not return a valid research task.', 'PROVIDER_ERROR');
    }
    return json({ investigation: investigationFromTask(result, input) }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
