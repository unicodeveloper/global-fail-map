import { execFile } from 'node:child_process';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const casesDir = path.join(__dirname, 'cases');
const verdictsPath = path.join(__dirname, 'case-verdicts.json');
const schemaPath = path.join(__dirname, 'verify-schema.json');

/**
 * Checks each candidate case against current sources before it can become a
 * pin. Fast research states present-tense claims confidently and is sometimes
 * wrong: a Lagos report had the Blue Line never carrying a passenger two years
 * after it opened. A case that turns out to be operating today is not a
 * failure and must not reach the atlas.
 */

interface CaseSection {
  id: string;
  reportId: string;
  title: string;
  period: string;
  body: string;
}

interface Verdict {
  id: string;
  reportId: string;
  title: string;
  stillFailed?: boolean;
  currentStatus?: string;
  statusAsOf?: string;
  openedOrResumed?: string;
  evidence?: string;
  confidence?: string;
  sources?: { title: string; url: string }[];
  error?: string;
}

async function loadEnvironment() {
  let raw = '';
  try {
    raw = await readFile(path.join(rootDir, '.env.local'), 'utf8');
  } catch {
    return;
  }
  for (const line of raw.split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match) continue;
    process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
}

function redact(value: unknown): string {
  const text = value instanceof Error ? value.message : String(value);
  const key = process.env.VALYU_API_KEY;
  return (key ? text.split(key).join('[redacted]') : text)
    .replace(/\bval_[A-Za-z0-9]{16,}\b/g, '[redacted]')
    .replace(/\s+/g, ' ')
    .slice(0, 240);
}

const CONCURRENCY = Number(process.env.CONCURRENCY || 6);

const schema = {
  type: 'object',
  properties: {
    still_failed: {
      type: 'boolean',
      description:
        'true if the attempt never reached the future it was aiming at. A company that shut down, exited, dissolved or went bankrupt is still_failed true, even though the closure itself finished. A product that was discontinued is true. A building or line that was cancelled, abandoned or left unfinished is true. Answer false ONLY if the thing it set out to build was actually delivered and is standing, running, operating or serving today, or if work has genuinely resumed and is progressing.',
    },
    current_status: {
      type: 'string',
      description:
        'The fate of the attempt, one of: cancelled, abandoned, unfinished, dissolved, discontinued, withdrawn, superseded, bankrupt, operating, resumed, completed, unknown. Use operating, resumed or completed only when the intended thing exists and works today.',
    },
    status_as_of: {
      type: 'string',
      description: 'Year or date the status was last confirmed',
    },
    opened_or_resumed_date: {
      type: 'string',
      description:
        'If it opened, resumed or was completed, the date. Empty string otherwise.',
    },
    evidence: {
      type: 'string',
      description: 'One sentence of evidence for the status, naming the source',
    },
    confidence: { type: 'string', description: 'high, moderate or low' },
  },
  required: [
    'still_failed',
    'current_status',
    'status_as_of',
    'evidence',
    'confidence',
  ],
};

/** The first paragraph carries what was attempted; the rest is elaboration. */
function gist(body: string): string {
  const prose = body
    .split('\n')
    .filter((line) => line.trim() && !/^#{1,6}\s/.test(line))
    .join(' ')
    .replace(/\[\[?\d+\]?\]\([^)]*\)/g, '')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return prose.slice(0, 700);
}

function question(section: CaseSection, country: string): string {
  return `Did this attempt reach what it set out to achieve, judged as of today: "${section.title}"${
    section.period ? ` (${section.period})` : ''
  } in ${country}?

Context from an earlier report: ${gist(section.body)}

Answer about this specific attempt, not a later or similarly named replacement built afterwards. A shutdown, exit, dissolution, bankruptcy or discontinuation is a failed attempt even though the shutdown itself concluded. Treat it as not failed only if the thing it aimed to build exists and is working today, or if construction has genuinely restarted and is progressing.`;
}

async function verifyWithRetries(
  section: CaseSection,
  country: string,
): Promise<Verdict> {
  let last: Verdict | null = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const verdict = await verify(section, country);
    if (!verdict.error) return verdict;
    last = verdict;
    await sleep(attempt * 4000);
  }
  return last!;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function verify(
  section: CaseSection,
  country: string,
): Promise<Verdict> {
  const base: Verdict = {
    id: section.id,
    reportId: section.reportId,
    title: section.title,
  };
  try {
    /* Without a timeout a stalled CLI holds its worker forever. Ten wedged
       workers took throughput from 24 cases a minute to under one. */
    const { stdout } = await execFileAsync(
      'valyu',
      [
        '--api-key',
        process.env.VALYU_API_KEY!,
        '-q',
        'answer',
        question(section, country),
        '--structured-file',
        schemaPath,
      ],
      { maxBuffer: 32 * 1024 * 1024, timeout: 90000, killSignal: 'SIGKILL' },
    );
    const start = stdout.indexOf('{');
    const parsed = JSON.parse(stdout.slice(start, stdout.lastIndexOf('}') + 1));
    const answer =
      typeof parsed.answer === 'string'
        ? JSON.parse(parsed.answer)
        : parsed.answer;
    return {
      ...base,
      stillFailed: answer.still_failed,
      currentStatus: answer.current_status,
      statusAsOf: answer.status_as_of,
      openedOrResumed: answer.opened_or_resumed_date || '',
      evidence: answer.evidence,
      confidence: answer.confidence,
      sources: (parsed.sources || [])
        .slice(0, 6)
        .map((source: { title?: string; url?: string }) => ({
          title: source.title || '',
          url: source.url || '',
        }))
        .filter((source: { url: string }) => source.url),
    };
  } catch (error) {
    return { ...base, error: redact(error) };
  }
}

async function main() {
  await loadEnvironment();
  if (!process.env.VALYU_API_KEY) throw new Error('VALYU_API_KEY is not set');
  await writeFile(schemaPath, `${JSON.stringify(schema, null, 2)}\n`);
  await mkdir(casesDir, { recursive: true });

  const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
  const files = (await readdir(casesDir))
    .filter((name) => name.endsWith('.json'))
    .filter((name) => !only || only.includes(name.replace(/\.json$/, '')))
    .sort();

  const countries = new Map<string, string>();
  const sections: CaseSection[] = [];
  for (const file of files) {
    const reportId = file.replace(/\.json$/, '');
    const sidecar = path.join(__dirname, 'outputs', `${reportId}.json`);
    try {
      countries.set(
        reportId,
        JSON.parse(await readFile(sidecar, 'utf8')).country || '',
      );
    } catch {
      countries.set(reportId, '');
    }
    sections.push(
      ...(JSON.parse(
        await readFile(path.join(casesDir, file), 'utf8'),
      ) as CaseSection[]),
    );
  }

  let done: Record<string, Verdict> = {};
  try {
    done = JSON.parse(await readFile(verdictsPath, 'utf8'));
  } catch {
    /* First run. */
  }
  const queue = sections.filter(
    (section) => !done[section.id] || done[section.id].error,
  );
  console.log(
    `${sections.length} cases, ${sections.length - queue.length} already verified, ${queue.length} to check.`,
  );

  let index = 0;
  let checked = 0;
  async function worker() {
    while (index < queue.length) {
      const section = queue[index++];
      const verdict = await verifyWithRetries(
        section,
        countries.get(section.reportId) || '',
      );
      done[section.id] = verdict;
      checked += 1;
      if (verdict.error) console.warn(`  error ${section.id}: ${verdict.error}`);
      else
        console.log(
          `  ${verdict.stillFailed ? 'failed ' : 'OPERATING'} ${verdict.currentStatus?.padEnd(12)} ${section.id}`,
        );
      if (checked % 10 === 0)
        await writeFile(verdictsPath, `${JSON.stringify(done, null, 2)}\n`);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker),
  );
  await writeFile(verdictsPath, `${JSON.stringify(done, null, 2)}\n`);

  const values = Object.values(done);
  const operating = values.filter((v) => v.stillFailed === false);
  console.log(`\nVerified ${values.length} cases.`);
  console.log(`  still failed: ${values.filter((v) => v.stillFailed).length}`);
  console.log(`  NOT failures (drop or rewrite): ${operating.length}`);
  console.log(`  errors: ${values.filter((v) => v.error).length}`);
  if (operating.length) {
    console.log('\nCases that are not failures:');
    for (const verdict of operating)
      console.log(
        `  ${verdict.id}\n    ${verdict.currentStatus} ${verdict.openedOrResumed} — ${verdict.evidence}`,
      );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
