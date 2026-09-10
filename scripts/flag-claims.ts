import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputsDir = path.join(__dirname, 'outputs');
const reviewPath = path.join(__dirname, 'claims-to-verify.md');

/**
 * Fast research writes confident prose, and its most damaging mistake is
 * calling something dead that is now running. A Lagos report asserted the Blue
 * Line had never carried a passenger two years after it opened. These patterns
 * find that shape of claim so it can be checked before a report becomes a
 * story on the atlas.
 */
const patterns: { label: string; expression: RegExp }[] = [
  /* Present-tense and present-perfect only. "OPS-4 was never launched" is
     settled history; "the line has never carried a passenger" is a claim about
     today, and today is what fast research gets wrong. */
  {
    label: 'has never operated',
    expression:
      /\b(?:has|have)\s+(?:still\s+)?never\s+(?:been\s+)?(?:\w+\s+){0,2}?(?:operated?|opened?|run|carried|launched|entered\s+(?:revenue\s+)?service|become\s+operational|reached\s+service|been\s+completed|been\s+finished)\b/i,
  },
  {
    label: 'no service ever',
    expression:
      /\bno\s+(?:train|passenger|vehicle|aircraft|flight|service|unit|customer|tenant|resident)\w*\s+(?:has|have)\s+ever\b/i,
  },
  {
    label: 'still unfinished',
    expression:
      /\b(?:remains?|stays?|is|are)\s+(?:still\s+)?(?:unfinished|incomplete|uncompleted|abandoned|derelict|non-?operational|out\s+of\s+service|mothballed|dormant)\b/i,
  },
  {
    label: 'yet to open',
    expression:
      /\b(?:has|have|had)\s+(?:yet|still)\s+to\s+(?:open|operate|launch|enter|carry|begin|be\s+completed)\b/i,
  },
  {
    label: 'defunct today',
    expression:
      /\b(?:today|currently|at\s+present|as\s+of\s+(?:20[12]\d|writing))\b[^.]{0,90}\b(?:defunct|abandoned|derelict|dormant|moribund|non-?operational|never\s+opened)\b/i,
  },
];

/** Splits prose into sentences without breaking inside a markdown link. */
function sentences(markdown: string): { text: string; line: number }[] {
  const results: { text: string; line: number }[] = [];
  const lines = markdown.split('\n');
  let fenced = false;
  for (const [index, line] of lines.entries()) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced || /^\s*(#|\||\[.+\]:)/.test(line)) continue;
    const prose = line
      .replace(/\[\[?\d+\]?\]\([^)]*\)/g, '')
      .replace(/\((?:https?:\/\/[^)]*)\)/g, '')
      .replace(/[*_`]/g, '')
      .trim();
    if (prose.length < 30) continue;
    for (const part of prose.split(/(?<=[.!?])\s+(?=[A-Z(])/)) {
      const text = part.trim();
      if (text.length >= 30) results.push({ text, line: index + 1 });
    }
  }
  return results;
}

async function main() {
  let files: string[];
  try {
    files = (await readdir(outputsDir)).filter((name) => name.endsWith('.md'));
  } catch {
    console.error('No reports in scripts/outputs yet.');
    process.exit(1);
  }
  files.sort();

  const rows: string[] = [];
  let flagged = 0;
  for (const file of files) {
    const id = file.replace(/\.md$/, '');
    const markdown = await readFile(path.join(outputsDir, file), 'utf8');
    const hits: { label: string; line: number; text: string }[] = [];
    for (const sentence of sentences(markdown)) {
      const pattern = patterns.find((entry) =>
        entry.expression.test(sentence.text),
      );
      if (!pattern) continue;
      /* A conditional or a generalisation is not a claim about one project. */
      if (
        /\b(?:if|unless|whenever|rarely|typically|generally|often|tend\s+to|can\s+be)\b/i.test(
          sentence.text,
        )
      )
        continue;
      /* The looser patterns need a named project or a date to be checkable. */
      const specific =
        /\b(?:18|19|20)\d{2}\b/.test(sentence.text) ||
        /\s[A-Z][a-zA-Z]{2,}/.test(sentence.text);
      if (!specific && !['has never operated', 'no service ever'].includes(pattern.label))
        continue;
      hits.push({
        label: pattern.label,
        line: sentence.line,
        text: sentence.text.replace(/\s+/g, ' ').slice(0, 320),
      });
    }
    if (!hits.length) continue;
    flagged += hits.length;
    rows.push(`\n## ${id}\n`);
    for (const hit of hits) {
      rows.push(`- **${hit.label}** (line ${hit.line})  \n  ${hit.text}`);
    }
  }

  const header = `# Claims to verify

Generated from ${files.length} reports. Each line asserts that something does
not operate, was never finished, or is defunct. Fast research states these
confidently and is sometimes wrong: a Lagos report claimed the Blue Line had
never carried a passenger in revenue service, two years after it opened.

Check each against a current source before the report becomes a story. A
project that opened late is not a failed project.

${flagged} claims across ${rows.filter((row) => row.startsWith('\n## ')).length} reports.
`;

  await writeFile(reviewPath, `${header}${rows.join('\n')}\n`);
  console.log(
    `${flagged} claims to verify across ${rows.filter((row) => row.startsWith('\n## ')).length} of ${files.length} reports.`,
  );
  console.log(`Written to ${path.relative(process.cwd(), reviewPath)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
