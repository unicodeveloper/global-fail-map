import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Checks one curated file on its own, so a batch can be validated without
 * running the builder, which rewrites the shared draft and cannot be run by
 * two people at once. Usage: npx tsx scripts/check-curated.ts <file>
 */

async function main() {
  const target = process.argv[2];
  if (!target) throw new Error('pass the curated file to check');

  const cases = new Map<string, { title: string; body: string }>();
  for (const file of await readdir(path.join(__dirname, 'cases'))) {
    if (!file.endsWith('.json')) continue;
    for (const section of JSON.parse(
      await readFile(path.join(__dirname, 'cases', file), 'utf8'),
    )) {
      cases.set(section.id, section);
    }
  }
  const places = JSON.parse(
    await readFile(path.join(__dirname, 'case-places.json'), 'utf8'),
  );

  const curatedDir = path.join(__dirname, 'curated');
  const taken = new Map<string, string>();
  const curatedAnywhere = new Set<string>();
  for (const file of await readdir(curatedDir)) {
    if (!file.endsWith('.json')) continue;
    for (const item of JSON.parse(
      await readFile(path.join(curatedDir, file), 'utf8'),
    )) {
      curatedAnywhere.add(item.id);
      if (path.basename(target) === file) continue;
      taken.set(item.id, file);
      taken.set(item.caseId, file);
    }
  }
  /* A story already merged from this same file is not a clash with itself, so
     only atlas entries no curated file accounts for are treated as taken. */
  for (const entry of JSON.parse(
    await readFile(path.join(__dirname, '..', 'src', 'data', 'examples.json'), 'utf8'),
  )) {
    if (!curatedAnywhere.has(entry.id)) taken.set(entry.id, 'the atlas');
  }

  const items = JSON.parse(await readFile(target, 'utf8'));
  const problems: string[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const where = item.id || item.caseId || '(unnamed)';
    for (const field of ['caseId', 'id', 'title', 'subtitle', 'location', 'summary', 'lesson', 'locationRole']) {
      if (!String(item[field] || '').trim()) problems.push(`${where}: missing ${field}`);
    }
    if (!cases.has(item.caseId)) problems.push(`${where}: no case named ${item.caseId}`);
    if (!places[item.caseId] && (item.lat === undefined || item.lng === undefined)) {
      problems.push(`${where}: no coordinates, and none supplied by hand`);
    }
    if (seen.has(item.id)) problems.push(`${where}: duplicate id in this file`);
    seen.add(item.id);
    if (taken.has(item.id)) problems.push(`${where}: id already used in ${taken.get(item.id)}`);
    if (taken.has(item.caseId)) problems.push(`${where}: case already curated in ${taken.get(item.caseId)}`);
    if (String(item.title || '').includes(':')) problems.push(`${where}: title carries a subtitle`);
    if (/\d{4}/.test(String(item.title || ''))) problems.push(`${where}: title carries dates`);
    if (String(item.subtitle || '').trim() === String(item.summary || '').trim()) {
      problems.push(`${where}: subtitle repeats the summary`);
    }
    if (String(item.subtitle || '').length > 90) problems.push(`${where}: subtitle over 90 characters`);
    if (String(item.lesson || '').trim().length <= 20) problems.push(`${where}: lesson too thin`);
    if (!/^[a-z0-9-]+$/.test(String(item.id || ''))) problems.push(`${where}: id is not a slug`);
    const category = String(item.category || '');
    if (category && !['companies', 'infrastructure', 'science', 'technology', 'visions'].includes(category)) {
      problems.push(`${where}: ${category} is not a category`);
    }
  }

  for (const problem of problems) console.error(`  ! ${problem}`);
  console.log(
    problems.length
      ? `${items.length} curated, ${problems.length} problems`
      : `${items.length} curated, all clean`,
  );
  process.exit(problems.length ? 1 : 0);

}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
