import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const casesDir = path.join(__dirname, 'cases');
const outputsDir = path.join(__dirname, 'outputs');
const curatedDir = path.join(__dirname, 'curated');

/**
 * Prints the next cases still waiting to be written up, with just enough of
 * each to author its entry: what was attempted, when, where the pin sits and
 * what the verification found. Reading whole dossiers for 677 cases would not
 * fit, and the opening paragraphs carry the facts an entry needs.
 */

interface CaseSection {
  id: string;
  reportId: string;
  title: string;
  period: string;
  body: string;
  sourceUrls: string[];
}

function gist(body: string, limit: number): string {
  return body
    .split('\n')
    .filter((line) => line.trim() && !/^#{1,6}\s/.test(line))
    .join(' ')
    .replace(/\[\[?\d+\]?\]\([^)]*\)/g, '')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

async function main() {
  const size = Number(process.env.SIZE || 14);
  const limit = Number(process.env.CHARS || 780);
  const buckets = JSON.parse(
    await readFile(path.join(__dirname, 'case-buckets.json'), 'utf8'),
  ) as { keep: string[] };
  const keep = new Set(buckets.keep);

  const curated = new Set<string>();
  for (const file of await readdir(curatedDir)) {
    if (!file.endsWith('.json')) continue;
    for (const item of JSON.parse(
      await readFile(path.join(curatedDir, file), 'utf8'),
    ) as { caseId: string }[]) {
      curated.add(item.caseId);
    }
  }

  const verdicts = JSON.parse(
    await readFile(path.join(__dirname, 'case-verdicts.json'), 'utf8'),
  ) as Record<string, { currentStatus?: string; confidence?: string }>;
  const places = JSON.parse(
    await readFile(path.join(__dirname, 'case-places.json'), 'utf8'),
  ) as Record<
    string,
    { latitude: number; longitude: number; precision: string; placeName?: string }
  >;

  const pending: CaseSection[] = [];
  for (const file of (await readdir(casesDir)).sort()) {
    if (!file.endsWith('.json')) continue;
    for (const section of JSON.parse(
      await readFile(path.join(casesDir, file), 'utf8'),
    ) as CaseSection[]) {
      if (keep.has(section.id) && !curated.has(section.id))
        pending.push(section);
    }
  }

  console.log(
    `${curated.size} curated, ${pending.length} left of ${keep.size}.\n`,
  );
  for (const section of pending.slice(0, size)) {
    const sidecar = JSON.parse(
      await readFile(path.join(outputsDir, `${section.reportId}.json`), 'utf8'),
    ) as { country: string; category: string; locationName: string };
    const verdict = verdicts[section.id] || {};
    const place = places[section.id];
    console.log(`### ${section.id}`);
    console.log(
      `${sidecar.country} | ${sidecar.category} | period ${section.period || '?'} | ${verdict.currentStatus} (${verdict.confidence})`,
    );
    console.log(
      `pin ${place.precision} ${place.latitude.toFixed(4)},${place.longitude.toFixed(4)} ${place.placeName || sidecar.locationName}`,
    );
    console.log(`TITLE: ${section.title}`);
    console.log(gist(section.body, limit));
    console.log();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
