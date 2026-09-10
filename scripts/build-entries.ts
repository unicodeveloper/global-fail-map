import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const casesDir = path.join(__dirname, 'cases');
const outputsDir = path.join(__dirname, 'outputs');
const curatedDir = path.join(__dirname, 'curated');
const reportsDir = path.join(rootDir, 'public', 'reports');
const draftPath = path.join(__dirname, 'examples-draft.json');

/**
 * Turns a curated case into an atlas entry and its report. The judgement, the
 * title, summary and lesson, is written by hand in scripts/curated; everything
 * mechanical, the dates, status, coordinates and sources, is carried across
 * from the research and the verification so the two cannot drift apart.
 */

interface Curated {
  caseId: string;
  id: string;
  title: string;
  subtitle: string;
  location: string;
  summary: string;
  lesson: string;
  locationRole: string;
  category?: string;
  /* Set when the geocoder put the pin somewhere the case is not. */
  lat?: number;
  lng?: number;
  period?: string;
  status?: string;
  statusDate?: string;
}

interface CaseSection {
  id: string;
  reportId: string;
  title: string;
  period: string;
  body: string;
  sourceUrls: string[];
}

interface Verdict {
  currentStatus?: string;
  statusAsOf?: string;
  confidence?: string;
}

const statusLabels: Record<string, string> = {
  abandoned: 'Abandoned',
  cancelled: 'Cancelled',
  unfinished: 'Unfinished',
  discontinued: 'Discontinued',
  withdrawn: 'Withdrawn',
  dissolved: 'Dissolved',
  bankrupt: 'Dissolved',
  superseded: 'Superseded',
};

/** A case body uses h3 inside the dossier; standing alone it wants h2. */
function reportMarkdown(title: string, body: string): string {
  const promoted = body
    .split('\n')
    .map((line) => (line.startsWith('### ') ? `## ${line.slice(4)}` : line))
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .trim();
  return `# ${title}\n\n${promoted}\n\n---\n`;
}

function years(period: string): number[] {
  return [...period.matchAll(/\b(1[5-9]\d{2}|20[0-4]\d)\b/g)].map((match) =>
    Number(match[1]),
  );
}

async function main() {
  const cases = new Map<string, CaseSection>();
  for (const file of await readdir(casesDir)) {
    if (!file.endsWith('.json')) continue;
    for (const section of JSON.parse(
      await readFile(path.join(casesDir, file), 'utf8'),
    ) as CaseSection[]) {
      cases.set(section.id, section);
    }
  }
  const verdicts: Record<string, Verdict> = JSON.parse(
    await readFile(path.join(__dirname, 'case-verdicts.json'), 'utf8'),
  );
  const places: Record<
    string,
    { latitude: number; longitude: number; precision: string }
  > = JSON.parse(
    await readFile(path.join(__dirname, 'case-places.json'), 'utf8'),
  );

  const curated: Curated[] = [];
  for (const file of (await readdir(curatedDir)).sort()) {
    if (!file.endsWith('.json')) continue;
    curated.push(
      ...(JSON.parse(
        await readFile(path.join(curatedDir, file), 'utf8'),
      ) as Curated[]),
    );
  }

  await mkdir(reportsDir, { recursive: true });
  const entries: unknown[] = [];
  const problems: string[] = [];

  for (const item of curated) {
    const section = cases.get(item.caseId);
    if (!section) {
      problems.push(`${item.id}: no case named ${item.caseId}`);
      continue;
    }
    const sidecar = JSON.parse(
      await readFile(
        path.join(outputsDir, `${section.reportId}.json`),
        'utf8',
      ),
    ) as {
      country: string;
      category: string;
      deepresearchId: string;
      deepresearchMode: string;
      sources: { title?: string; url: string }[];
    };
    const verdict = verdicts[item.caseId] || {};
    const place = places[item.caseId];
    if (!place) {
      problems.push(`${item.id}: no coordinates`);
      continue;
    }

    /* A case body cites [[n]] against the sidecar's whole source list, so the
       entry has to carry that list intact and in order. Rebuilding it from the
       case's own URLs, or trimming it, renumbers every citation in the report. */
    const sources = sidecar.sources.flatMap((source) =>
      source?.url
        ? [
            {
              title: (
                source.title || new URL(source.url).hostname.replace(/^www\./, '')
              ).replaceAll('\u2014', '-'),
              url: source.url,
            },
          ]
        : [],
    );
    if (!section.sourceUrls.length) {
      problems.push(`${item.id}: no sources cited in case`);
    }

    const period = item.period || section.period;
    const spanned = years(period);
    const status =
      item.status ||
      statusLabels[(verdict.currentStatus || '').toLowerCase()] ||
      'Abandoned';

    await writeFile(
      path.join(reportsDir, `${item.id}.md`),
      reportMarkdown(item.title, section.body),
    );

    entries.push({
      id: item.id,
      title: item.title,
      subtitle: item.subtitle,
      location: item.location,
      country: sidecar.country,
      lat: item.lat ?? place.latitude,
      lng: item.lng ?? place.longitude,
      category: item.category || sidecar.category,
      status,
      /* verdict.statusAsOf is when the status was confirmed, not when it
         happened. Showing it as "Status date" dated a 1983 closure to 2022,
         so a status date is only carried when curated by hand. */
      ...(item.statusDate ? { statusDate: item.statusDate } : {}),
      period,
      year: spanned[0] ?? 0,
      summary: item.summary,
      lesson: item.lesson,
      locationRole: item.locationRole,
      confidence: (verdict.confidence || 'moderate').toLowerCase(),
      reportPath: `/reports/${item.id}.md`,
      deepresearchMode: sidecar.deepresearchMode,
      deepresearchId: sidecar.deepresearchId,
      sources,
    });
  }

  await writeFile(draftPath, `${JSON.stringify(entries, null, 2)}\n`);
  console.log(`${entries.length} entries written to ${path.relative(rootDir, draftPath)}`);
  console.log(`${entries.length} reports written to public/reports/`);
  for (const problem of problems) console.warn(`  ! ${problem}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
