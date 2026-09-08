const taskIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isResearchTaskId(value: unknown): value is string {
  return typeof value === 'string' && taskIdPattern.test(value);
}

export function researchPath(id: string): string {
  if (!isResearchTaskId(id)) throw new Error('Invalid research task ID.');
  return `/?research=${encodeURIComponent(id)}`;
}

export function sharedResearchPath(id: string): string {
  if (!isResearchTaskId(id)) throw new Error('Invalid research task ID.');
  return `/?share=${encodeURIComponent(id)}`;
}

export function sharedResearchUrl(origin: string, id: string): string {
  return new URL(sharedResearchPath(id), origin).href;
}

export function researchIdFromUrl(
  url: string | URL,
): { id: string; shared: boolean } | null {
  const parsed =
    typeof url === 'string' ? new URL(url, 'http://localhost') : url;
  const shared = parsed.searchParams.get('share');
  if (isResearchTaskId(shared)) return { id: shared, shared: true };
  const owned = parsed.searchParams.get('research');
  return isResearchTaskId(owned) ? { id: owned, shared: false } : null;
}
