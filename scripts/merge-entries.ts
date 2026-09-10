import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const draftPath = path.join(__dirname, 'examples-draft.json');
const examplesPath = path.join(rootDir, 'src', 'data', 'examples.json');

/**
 * Folds the built draft into the atlas the site actually reads. Curating a case
 * and running build-entries only produces a draft; without this step the story
 * has a report on disk that nothing ever links to, which is how five finished
 * cases sat unpublished. Entries already in the atlas are refreshed in place so
 * a correction to a curated line reaches the site, and stories that predate the
 * case pipeline are left alone.
 */

interface Entry {
  id: string;
  title: string;
  subtitle: string;
  summary: string;
  lesson: string;
  lat: number;
  lng: number;
  sources: { title: string; url: string }[];
  [key: string]: unknown;
}

function check(entry: Entry): string[] {
  const problems: string[] = [];
  if (!entry.subtitle?.trim()) problems.push('no subtitle');
  if (entry.subtitle?.trim() === entry.summary?.trim()) {
    problems.push('subtitle repeats the summary');
  }
  if (entry.title?.includes(':')) problems.push('title carries a subtitle');
  if ((entry.lesson || '').trim().length <= 20) problems.push('lesson too thin');
  if (!Number.isFinite(entry.lat) || !Number.isFinite(entry.lng)) {
    problems.push('no coordinates');
  }
  if (!entry.sources?.length) problems.push('no sources');
  return problems.map((problem) => `${entry.id}: ${problem}`);
}

async function main() {
  const draft: Entry[] = JSON.parse(await readFile(draftPath, 'utf8'));
  const examples: Entry[] = JSON.parse(await readFile(examplesPath, 'utf8'));

  const problems = draft.flatMap(check);
  if (problems.length) {
    for (const problem of problems) console.error(`  ! ${problem}`);
    throw new Error(`${problems.length} entries are not ready to publish`);
  }

  const byId = new Map(examples.map((entry) => [entry.id, entry]));
  let added = 0;
  let updated = 0;
  for (const entry of draft) {
    const existing = byId.get(entry.id);
    if (existing) {
      Object.assign(existing, entry);
      updated += 1;
    } else {
      examples.push(entry);
      byId.set(entry.id, entry);
      added += 1;
    }
  }

  await writeFile(examplesPath, `${JSON.stringify(examples, null, 2)}\n`);
  console.log(`${added} added, ${updated} refreshed, ${examples.length} stories total`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
