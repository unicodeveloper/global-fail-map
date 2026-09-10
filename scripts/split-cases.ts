import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputsDir = path.join(__dirname, 'outputs');
const casesDir = path.join(__dirname, 'cases');

/**
 * Splits a location dossier into the individual attempts it documents, so each
 * can become one pin. Headings are not uniform across reports ("Part One:",
 * "Case 1:", or plain prose), and a report also carries summary, analysis and
 * source sections that are not cases at all, so sections are kept or dropped on
 * what they contain rather than on how they are titled.
 */

/** Sections that frame the report rather than document an attempt. */
const framing =
  /^(?:executive\s+summary|summary|introduction|overview|background|conclusion(?:s)?|sources|references|bibliography|source\s+links|patterns?(?:\s+and\s+\w+)*|analysis|systemic\s+\w+|methodology|method|lessons?(?:\s+\w+)*|what\s+survived|appendix|notes?|data\s+gaps|missing\s+\w+|geographic\s+verification|synthesis|supporting\s+\w+|regional\s+context|comparative\s+\w+|implications?|reflections?|discussion|further\s+reading|epilogue|afterword|timeline|glossary|why\s+|how\s+|what\s+|broader\s+\w+|wider\s+\w+|financial\s+\w+|economic\s+\w+|social\s+\w+|political\s+\w+|environmental\s+\w+|current\s+\w+|associated\s+\w+|the\s+broader|these\s+cases|common\s+\w+|shared\s+\w+|cross-?cutting|quadro\s+\w+|an[aá]lise\s+\w+|verifica[cç][aã]o\s+\w+|limita[cç][oõ]es|conclus[aã]o|resumo|introdu[cç][aã]o)\b/i;

/** A section that says the subject is fine is not a failure to pin. */
const notAFailure =
  /\((?:not\s+abandoned|still\s+operating|operational|completed|successful)\)|\b(?:without\s+abandonment|not\s+abandoned|overcoming\s+obstacles|success\s+story|now\s+operating|since\s+completed)\b/i;

const failureSignal =
  /\b(?:cancell?ed|abandoned|unfinished|incomplete|uncompleted|dissolved|liquidat(?:ed|ion)|receivership|discontinued|withdrawn|terminated|suspended|halted|stalled|defunct|bankrupt(?:cy)?|collapsed?|failed|failure|mothballed|shelved|scrapped|never\s+(?:built|completed|opened|operated))\b/i;

interface CaseSection {
  id: string;
  reportId: string;
  title: string;
  headingLine: number;
  years: number[];
  period: string;
  wordCount: number;
  body: string;
  sourceUrls: string[];
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-')
    .slice(0, 7)
    .join('-');
}

/** Drops the "Part Three:" or "Case 1:" ordinal prefix a report may carry. */
function cleanHeading(heading: string): string {
  return heading
    .replace(
      /^(?:part\s+[a-z]+|case\s*\d+|chapter\s+[a-z0-9]+|section\s+[a-z0-9]+|\d+)\s*[:.)-]\s*/i,
      '',
    )
    .replace(/\s*[-–—]\s*$/, '')
    .trim();
}

function years(text: string): number[] {
  const found = [...text.matchAll(/\b(1[5-9]\d{2}|20[0-4]\d)\b/g)].map((match) =>
    Number(match[1]),
  );
  return [...new Set(found)].sort((left, right) => left - right);
}

function splitReport(reportId: string, markdown: string): CaseSection[] {
  const strict = collectSections(reportId, markdown, true);
  /* A report written in another language matches none of the English failure
     vocabulary, so the signal filter is dropped rather than losing the report. */
  return strict.length ? strict : collectSections(reportId, markdown, false);
}

function collectSections(
  reportId: string,
  markdown: string,
  requireSignal: boolean,
): CaseSection[] {
  const lines = markdown.split('\n');
  const boundaries: { line: number; heading: string }[] = [];
  let fenced = false;
  for (const [index, line] of lines.entries()) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    if (fenced) continue;
    const heading = line.match(/^##\s+(.+?)\s*#*\s*$/);
    if (heading) boundaries.push({ line: index, heading: heading[1].trim() });
  }

  const sections: CaseSection[] = [];
  const used = new Set<string>();
  for (const [index, boundary] of boundaries.entries()) {
    const end = boundaries[index + 1]?.line ?? lines.length;
    const body = lines.slice(boundary.line + 1, end).join('\n').trim();
    const title = cleanHeading(boundary.heading);
    if (!title || framing.test(title) || notAFailure.test(boundary.heading))
      continue;
    const words = body.split(/\s+/).filter(Boolean).length;
    /* A real case argues something; a transitional heading does not. */
    if (words < 120) continue;
    if (requireSignal && !failureSignal.test(`${title}\n${body}`)) continue;

    const sourceUrls = [
      ...new Set(
        [...body.matchAll(/\]\((https?:\/\/[^\s)]+)\)/g)].map(
          (match) => match[1],
        ),
      ),
    ];
    const inHeading = years(boundary.heading);
    const span = inHeading.length ? inHeading : years(body).slice(0, 2);
    let id = `${reportId}--${slug(title)}`;
    let suffix = 2;
    while (used.has(id)) id = `${reportId}--${slug(title)}-${suffix++}`;
    used.add(id);

    sections.push({
      id,
      reportId,
      title,
      headingLine: boundary.line + 1,
      years: span,
      period: span.length
        ? span.length > 1 && span[0] !== span.at(-1)
          ? `${span[0]}-${span.at(-1)}`
          : `${span[0]}`
        : '',
      wordCount: words,
      body,
      sourceUrls,
    });
  }
  return sections;
}

async function main() {
  const files = (await readdir(outputsDir))
    .filter((name) => name.endsWith('.md'))
    .sort();
  await mkdir(casesDir, { recursive: true });

  const index: Record<string, number> = {};
  let total = 0;
  let noYears = 0;
  for (const file of files) {
    const reportId = file.replace(/\.md$/, '');
    const markdown = await readFile(path.join(outputsDir, file), 'utf8');
    const sections = splitReport(reportId, markdown);
    index[reportId] = sections.length;
    total += sections.length;
    noYears += sections.filter((section) => !section.period).length;
    await writeFile(
      path.join(casesDir, `${reportId}.json`),
      `${JSON.stringify(sections, null, 2)}\n`,
    );
  }

  const counts = Object.values(index).sort((left, right) => left - right);
  console.log(`${total} candidate cases from ${files.length} reports.`);
  console.log(
    `per report: min=${counts[0]} median=${counts[Math.floor(counts.length / 2)]} max=${counts.at(-1)}`,
  );
  console.log(`reports yielding none: ${counts.filter((n) => n === 0).length}`);
  console.log(`cases with no year found: ${noYears}`);
  console.log(`written to ${path.relative(process.cwd(), casesDir)}/`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
