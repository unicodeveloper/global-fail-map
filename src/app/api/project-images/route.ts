import {
  projectImageInputSchema,
  selectProjectImages,
} from '@/lib/project-images';
import {
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

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const account = await requireAccount();
    const parsed = projectImageInputSchema.safeParse(await readJson(request));
    if (!parsed.success)
      throw new RequestError(
        400,
        'Choose a project name to find photos.',
        'INVALID_INPUT',
      );
    const { projectName, locationName, subjects } = parsed.data;
    const targets = subjects?.length ? subjects : [projectName];
    const results = await Promise.allSettled(
      targets.map(async (target) => {
        const result = await callResearch(
          '/v1/deepsearch',
          'POST',
          account.accessToken,
          {
            query: `${target}${locationName ? ` ${locationName}` : ''} photographs`,
            search_type: 'web',
            max_num_results: 10,
          },
        );
        if (
          !result ||
          typeof result !== 'object' ||
          !('results' in result) ||
          !Array.isArray(result.results)
        ) {
          throw new RequestError(
            502,
            'Photo search is temporarily unavailable. Please try again.',
            'PROVIDER_ERROR',
          );
        }
        return selectProjectImages(result, target).slice(
          0,
          targets.length > 1 ? 2 : 5,
        );
      }),
    );
    const successful = results.filter(
      (result) => result.status === 'fulfilled',
    );
    if (!successful.length) throw (results[0] as PromiseRejectedResult).reason;
    const found = successful.flatMap((result) => result.value);
    return json({
      images: [
        ...new Map(found.map((image) => [image.url, image])).values(),
      ].slice(0, 5),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
