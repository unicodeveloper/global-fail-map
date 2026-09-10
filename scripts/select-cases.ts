import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const casesDir = path.join(__dirname, 'cases');
const outputsDir = path.join(__dirname, 'outputs');
const selectionPath = path.join(__dirname, 'case-selection.json');

/**
 * Chooses which verified cases are worth a pin. The atlas holds 32 entries,
 * each a story someone would read; adding every one of 677 would change what
 * the map is. An abandoned culture house in a village of 400 is a real failure
 * and a thin pin, so cases are ranked on how well documented and how
 * consequential they are, and the strongest are taken.
 *
 * Every report contributes its best case regardless of score, so the map keeps
 * its global spread instead of collapsing onto the best documented countries.
 */

interface CaseSection {
  id: string;
  reportId: string;
  title: string;
  period: string;
  wordCount: number;
  body: string;
  sourceUrls: string[];
}

const TARGET = Number(process.env.TARGET || 280);
/* A report only earns its guaranteed pin if its best case clears the bar.
   Reserving a slot per report regardless pulled in 14-point entries while
   34-point ones were dropped, which is the opposite of the point. */
const FLOOR = Number(process.env.FLOOR || 25);

/** Money, scale and national weight are what separate a story from a footnote. */
function score(section: CaseSection, confidence: string): number {
  const text = `${section.title}\n${section.body}`;
  let value = 0;

  value += Math.min(section.sourceUrls.length, 8) * 3;
  value += Math.min(section.wordCount / 100, 8);
  if (confidence === 'high') value += 6;
  else if (confidence === 'moderate') value += 2;

  /* A sum of money is the clearest sign the attempt was consequential. */
  const money = text.match(
    /(?:US\$|\$|£|€|¥|₦|₹|R\$)\s?\d[\d,.]*\s?(?:billion|million|bn|m\b)|\b\d[\d,.]*\s?(?:billion|million)\s+(?:dollars|euros|pounds|naira|rupees|yen)/gi,
  );
  value += Math.min((money || []).length, 6) * 2.5;

  /* Physical or human scale. */
  if (/\b\d[\d,.]*\s?(?:km|kilometres|kilometers|miles|hectares|acres|MW|GW|megawatts|gigawatts|tonnes|passengers|residents|homes|units|beds)\b/i.test(text))
    value += 4;

  /* National or international weight. */
  if (/\b(?:national|federal|state-owned|government|parliament|president|prime minister|world bank|imf|european union|united nations|flagship|landmark)\b/i.test(text))
    value += 3;

  /* A named subject beats a category. */
  if (/\b(?:Limited|Ltd|Inc|Corporation|Company|Airlines?|Railway|Airport|Bridge|Dam|Plant|Refinery|Port|Metro|Tramway|Stadium|Hospital|Project|Programme|Program|Scheme|Line|Tower|Complex)\b/.test(section.title))
    value += 3;
  if (/\b(1[5-9]\d{2}|20[0-4]\d)\b/.test(section.period)) value += 2;

  /* Thin or residual sections. */
  if (/\b(?:historical precedent|other|further|additional|minor|limited documentation|context|miscellane)/i.test(section.title))
    value -= 8;
  if (section.wordCount < 250) value -= 5;
  if (section.sourceUrls.length === 0) value -= 10;

  return Math.round(value * 10) / 10;
}

async function main() {
  const buckets = JSON.parse(
    await readFile(path.join(__dirname, 'case-buckets.json'), 'utf8'),
  ) as { keep: string[] };
  const keep = new Set(buckets.keep);
  const verdicts = JSON.parse(
    await readFile(path.join(__dirname, 'case-verdicts.json'), 'utf8'),
  ) as Record<string, { confidence?: string }>;

  const scored: {
    id: string;
    reportId: string;
    title: string;
    country: string;
    category: string;
    value: number;
  }[] = [];

  for (const file of (await readdir(casesDir)).sort()) {
    if (!file.endsWith('.json')) continue;
    const reportId = file.replace(/\.json$/, '');
    const sidecar = JSON.parse(
      await readFile(path.join(outputsDir, `${reportId}.json`), 'utf8'),
    ) as { country: string; category: string };
    for (const section of JSON.parse(
      await readFile(path.join(casesDir, file), 'utf8'),
    ) as CaseSection[]) {
      if (!keep.has(section.id)) continue;
      scored.push({
        id: section.id,
        reportId,
        title: section.title,
        country: sidecar.country,
        category: sidecar.category,
        value: score(section, (verdicts[section.id]?.confidence || '').toLowerCase()),
      });
    }
  }

  scored.sort((left, right) => right.value - left.value);

  /* One from every report first, so no country drops off the map. */
  const chosen = new Map<string, (typeof scored)[number]>();
  const seenReports = new Set<string>();
  for (const entry of scored) {
    if (seenReports.has(entry.reportId) || entry.value < FLOOR) continue;
    seenReports.add(entry.reportId);
    chosen.set(entry.id, entry);
  }
  for (const entry of scored) {
    if (chosen.size >= TARGET) break;
    if (entry.value < FLOOR) break;
    chosen.set(entry.id, entry);
  }

  const selected = [...chosen.values()].sort(
    (left, right) => right.value - left.value,
  );
  const values = selected.map((entry) => entry.value);
  const byCountry = new Map<string, number>();
  const byCategory = new Map<string, number>();
  for (const entry of selected) {
    byCountry.set(entry.country, (byCountry.get(entry.country) || 0) + 1);
    byCategory.set(entry.category, (byCategory.get(entry.category) || 0) + 1);
  }

  await writeFile(
    selectionPath,
    `${JSON.stringify(
      selected.map((entry) => ({
        id: entry.id,
        score: entry.value,
        country: entry.country,
        title: entry.title,
      })),
      null,
      2,
    )}\n`,
  );

  console.log(`${scored.length} verified cases scored, ${selected.length} selected.`);
  console.log(
    `score range: ${values.at(-1)} to ${values[0]} (cut at ${values.at(-1)})`,
  );
  console.log(`countries represented: ${byCountry.size}`);
  console.log(`categories: ${JSON.stringify(Object.fromEntries(byCategory))}`);
  console.log(`\ntop of the list:`);
  for (const entry of selected.slice(0, 8))
    console.log(`  ${String(entry.value).padStart(5)}  ${entry.country.padEnd(14)} ${entry.title.slice(0, 62)}`);
  console.log(`\nat the cut line:`);
  for (const entry of selected.slice(-6))
    console.log(`  ${String(entry.value).padStart(5)}  ${entry.country.padEnd(14)} ${entry.title.slice(0, 62)}`);
  console.log(`\ndropped, highest scoring first:`);
  for (const entry of scored.filter((e) => !chosen.has(e.id)).slice(0, 6))
    console.log(`  ${String(entry.value).padStart(5)}  ${entry.country.padEnd(14)} ${entry.title.slice(0, 62)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
