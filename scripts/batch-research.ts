import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const targetsPath = path.join(__dirname, 'expansion-targets.json');
const outputsDir = path.join(__dirname, 'outputs');
const progressPath = path.join(__dirname, 'research-progress.json');

interface Target {
  id: string;
  country: string;
  locationName: string;
  category: string;
}

type TargetState = 'pending' | 'running' | 'completed' | 'failed';

interface TargetProgress {
  status: TargetState;
  taskId?: string;
  batchId?: string;
  lat?: number;
  lng?: number;
  attempts: number;
  error?: string;
  words?: number;
  cost?: number;
}

interface Progress {
  version: 3;
  targets: Record<string, TargetProgress>;
}

/**
 * The key inherited from the shell, captured before .env.local overwrites it.
 * An interrupted run created batches under this identity, and only it can read
 * them back, so it is kept to adopt that work rather than pay for it twice.
 */
const inheritedKey = process.env.VALYU_API_KEY;

/**
 * Reads .env.local and lets it win over the ambient environment. A stale
 * VALYU_API_KEY exported in the shell belongs to a different identity, and
 * tasks are only readable by the identity that created them, so preferring the
 * inherited value silently orphaned every task the previous run created.
 */
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

/** Keeps credentials out of the log file and out of thrown errors. */
function redact(value: unknown): string {
  const text = value instanceof Error ? value.message : String(value);
  const key = process.env.VALYU_API_KEY;
  return (key ? text.split(key).join('[redacted]') : text)
    .replace(/\bval_[A-Za-z0-9]{16,}\b/g, '[redacted]')
    .replace(/\s+/g, ' ')
    .slice(0, 300);
}

const CHUNK_SIZE = Number(process.env.CHUNK_SIZE || 20);
const MAX_BATCHES = Number(process.env.MAX_BATCHES || 3);
const POLL_INTERVAL_MS = 20000;

function apiKey() {
  const key = process.env.VALYU_API_KEY;
  if (!key) throw new Error('VALYU_API_KEY is not set');
  return key;
}

/**
 * The CLI's stored credentials belong to a different identity than the project
 * key, and tasks are only readable by the identity that created them, so every
 * invocation passes the project key explicitly.
 */
async function valyu(args: string[], key?: string): Promise<unknown> {
  const { stdout } = await execFileAsync(
    'valyu',
    ['--api-key', key || apiKey(), '-q', ...args],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  const start = stdout.search(/[[{]/);
  if (start < 0) throw new Error(`valyu ${args[0]}: no JSON in output`);
  /* The CLI appends an upgrade notice after the JSON body. */
  const text = stdout.slice(start);
  let depth = 0;
  let end = -1;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === '{' || character === '[') depth += 1;
    else if (character === '}' || character === ']') {
      depth -= 1;
      if (depth === 0) {
        end = index + 1;
        break;
      }
    }
  }
  const parsed = JSON.parse(end > 0 ? text.slice(0, end) : text);
  if (parsed && typeof parsed === 'object' && 'error' in parsed) {
    const error = (parsed as { error: { message?: string } }).error;
    throw new Error(redact(error?.message || 'valyu returned an error'));
  }
  return parsed;
}

async function loadTargets(): Promise<Target[]> {
  return JSON.parse(await readFile(targetsPath, 'utf8')) as Target[];
}

/**
 * Reads the progress file, converting the original completed/failed/inFlight
 * shape. Tasks already launched keep their identifier so a rerun adopts
 * research already paid for. Targets recorded as failed without an identifier
 * never reached Valyu, so they return to the queue.
 */
async function loadProgress(): Promise<Progress> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(progressPath, 'utf8'));
  } catch {
    return { version: 3, targets: {} };
  }
  const record = raw as {
    version?: number;
    targets?: Record<string, TargetProgress>;
    completed?: string[];
    failed?: string[];
    inFlight?: string[];
    taskMap?: Record<string, string>;
  };
  if (record.version === 3 && record.targets)
    return { version: 3, targets: record.targets };
  if (record.version === 2 && record.targets)
    return { version: 3, targets: record.targets };

  const targets: Record<string, TargetProgress> = {};
  const taskMap = record.taskMap || {};
  for (const id of record.completed || [])
    targets[id] = { status: 'completed', taskId: taskMap[id], attempts: 1 };
  for (const id of [...(record.inFlight || []), ...(record.failed || [])])
    targets[id] = taskMap[id]
      ? { status: 'running', taskId: taskMap[id], attempts: 1 }
      : { status: 'pending', attempts: 0 };
  return { version: 3, targets };
}

let saving: Promise<void> = Promise.resolve();
function saveProgress(progress: Progress) {
  saving = saving.then(() =>
    writeFile(progressPath, `${JSON.stringify(progress, null, 2)}\n`),
  );
  return saving;
}

const categoryFocus: Record<string, string> = {
  companies:
    'dissolved companies, discontinued businesses and abandoned corporate programmes',
  infrastructure:
    'cancelled, unfinished or abandoned infrastructure and public works',
  science:
    'terminated or withdrawn clinical trials and discontinued scientific research programmes',
  technology: 'discontinued inventions, products and technological programmes',
  visions:
    'unrealised cities, utopian settlements and ambitious projects that were abandoned',
};

function buildPrompt(target: Target, lat: number, lng: number): string {
  return `Research target: ${target.locationName}
Research coordinates: ${lat}, ${lng}
Research category: ${target.category}

Research documented attempts that did not reach their intended future in or meaningfully connected to the named area "${target.locationName}" in ${target.country}. Research the full named area, not only the locality around the clicked point. The coordinates (${lat}, ${lng}) are a navigation anchor, not a restriction on the research boundary.
Focus on ${categoryFocus[target.category]}. Cover different historical periods where the evidence supports it. Select three to six compelling cases, or fewer when reliable evidence is scarce. The map pin is a geographic starting point, not proof every project occurred at those coordinates.

Before including a case, establish its status as of ${new Date().toISOString().slice(0, 10)} from current sources. A project that was delayed, over budget, or long troubled but has since opened, launched or resumed service is not a failure and must not be presented as one. State the opening or resumption date when a project reached service after difficulty, and drop the case if its only claim to failure is delay it has since overcome. Never write that something has never operated without a current source establishing that.

For each case, establish what people tried to build, why it mattered, dates, the exact geographic connection (project site, headquarters, laboratory, trial site or another clearly named role), the sourced status, what ended and why, and what survived. Distinguish a failed organisation from a successful technology that outlived it. Use precise statuses such as cancelled, discontinued, withdrawn, dissolved, abandoned or superseded. A terminated trial does not establish lack of efficacy, safety problems or scientific failure unless the evidence explicitly says so. Do not call a currently operating business failed. Distinguish reported allegations, documented findings and disputed interpretations. Treat missing evidence as unknown.

Write a thorough, compelling and factual Markdown investigation. Let the subject and evidence determine the length and structure, with natural headings and enough technical, commercial and historical detail to explain what happened. Do not force a short summary, a fixed template or generic lessons. Respect ambitious builders and the people affected. Prefer primary sources including company filings, official archives, regulatory records, trial registries and contemporary documentation. Link citations directly to supporting sources throughout the report. Verify dates, money amounts and location roles. Make evidence confidence and uncertainty explicit where they matter. Do not fabricate quotations, coordinates, sources or causes. Avoid em dashes, generic motivational slogans and marketing language. Write the report in English, giving original-language names for places, projects and organisations where they help.`;
}

/**
 * Tasks are matched back to targets by the three header lines rather than the
 * whole prompt, so batches already in flight are still adopted after the
 * prompt body is edited.
 */
function matchKey(query: string): string {
  return query.split('\n').slice(0, 3).join('\n');
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface Coordinates {
  lat: number;
  lng: number;
}

/**
 * Mapbox answers "New Administrative Capital, Egypt" with a road in
 * Connecticut, so a result is only accepted when it sits in the country the
 * target names. Failing that the country itself anchors the pin, which at
 * least keeps the report on the right continent.
 */
async function geocodeQuery(
  query: string,
  country: string,
  limit: number,
): Promise<Coordinates | null> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  if (!token) throw new Error('NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN is not set');
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&limit=${limit}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) return null;
  const data = (await response.json()) as {
    features?: {
      center: [number, number];
      place_name?: string;
      context?: { text?: string }[];
    }[];
  };
  const wanted = country.toLowerCase();
  for (const feature of data.features || []) {
    const names = [
      feature.place_name || '',
      ...(feature.context || []).map((entry) => entry.text || ''),
    ]
      .join(' | ')
      .toLowerCase();
    if (limit === 1 || names.includes(wanted)) {
      const [lng, lat] = feature.center;
      return { lat, lng };
    }
  }
  return null;
}

async function geocode(target: Target): Promise<Coordinates> {
  const precise = await geocodeQuery(
    `${target.locationName}, ${target.country}`,
    target.country,
    5,
  );
  if (precise) return precise;
  const fallback = await geocodeQuery(target.country, target.country, 1);
  if (!fallback) throw new Error(`geocode failed for ${target.locationName}`);
  console.warn(
    `  ${target.id}: no match for "${target.locationName}", anchored on ${target.country}`,
  );
  return fallback;
}

interface BatchTask {
  deepresearch_id?: string;
  status?: string;
  query?: string;
  output?: string;
  sources?: unknown[];
  cost?: number;
  error?: string;
}

/** The report and the evidence behind it, ready for curation into the atlas. */
async function saveReport(
  target: Target,
  entry: TargetProgress,
  task: BatchTask,
) {
  await mkdir(outputsDir, { recursive: true });
  await writeFile(
    path.join(outputsDir, `${target.id}.md`),
    `${(task.output || '').trim()}\n`,
  );
  await writeFile(
    path.join(outputsDir, `${target.id}.json`),
    `${JSON.stringify(
      {
        id: target.id,
        country: target.country,
        locationName: target.locationName,
        category: target.category,
        latitude: entry.lat,
        longitude: entry.lng,
        deepresearchId: entry.taskId,
        deepresearchMode: 'fast',
        cost: task.cost,
        sources: Array.isArray(task.sources) ? task.sources : [],
      },
      null,
      2,
    )}\n`,
  );
}

function recordCompletion(entry: TargetProgress, task: BatchTask) {
  entry.status = 'completed';
  entry.words = (task.output || '').split(/\s+/).filter(Boolean).length;
  entry.cost = task.cost;
  if (task.deepresearch_id) entry.taskId = task.deepresearch_id;
}

/**
 * Picks up standalone tasks launched before this script used batches, so the
 * reports they already produced are saved rather than researched again.
 */
async function adoptStandaloneTasks(targets: Target[], progress: Progress) {
  const pending = targets.filter((target) => {
    const entry = progress.targets[target.id];
    return entry?.status === 'running' && entry.taskId && !entry.batchId;
  });
  if (!pending.length) return;
  console.log(`Adopting ${pending.length} standalone tasks...`);
  for (const target of pending) {
    const entry = progress.targets[target.id];
    try {
      const task = (await valyu([
        'deepresearch',
        'status',
        entry.taskId!,
      ])) as BatchTask;
      const status = (task.status || '').toLowerCase();
      if (status === 'completed' && task.output) {
        recordCompletion(entry, task);
        await saveReport(target, entry, task);
        console.log(`  adopted ${target.id} (${entry.words} words)`);
      } else if (status === 'failed' || status === 'cancelled') {
        entry.status = 'pending';
        delete entry.taskId;
        console.warn(`  ${target.id} was ${status}, requeued`);
      } else {
        console.log(`  ${target.id} still ${status}`);
      }
    } catch (error) {
      entry.status = 'pending';
      delete entry.taskId;
      console.warn(`  ${target.id} unreadable (${redact(error)}), requeued`);
    }
    await saveProgress(progress);
  }
}

/**
 * Harvests batches left running by an earlier invocation, including any created
 * under the inherited key. Returns the batch ids still in progress.
 */
async function adoptExistingBatches(
  targets: Target[],
  targetsById: Map<string, Target>,
  progress: Progress,
): Promise<OpenBatch[]> {
  const batches = new Map<string, Target[]>();
  for (const target of targets) {
    const entry = progress.targets[target.id];
    if (entry.status !== 'running' || !entry.batchId) continue;
    const members = batches.get(entry.batchId) || [];
    members.push(target);
    batches.set(entry.batchId, members);
  }
  if (!batches.size) return [];
  console.log(`Adopting ${batches.size} existing batches...`);

  const outstanding: OpenBatch[] = [];
  for (const [batchId, members] of batches) {
    let tasks: BatchTask[] | null = null;
    let workingKey: string | undefined;
    for (const key of [undefined, inheritedKey]) {
      try {
        const result = (await valyu(
          ['batch', 'tasks', batchId, '--include-output', '-n', '100'],
          key,
        )) as { tasks?: BatchTask[] };
        tasks = result.tasks || [];
        workingKey = key;
        break;
      } catch {
        /* Try the other identity before giving up on the batch. */
      }
    }
    if (!tasks) {
      console.warn(`  ${batchId} unreadable, requeuing ${members.length}`);
      for (const target of members) {
        const entry = progress.targets[target.id];
        entry.status = 'pending';
        delete entry.batchId;
      }
      continue;
    }
    const byQuery = new Map(
      members.map((target) => [
        matchKey(
          buildPrompt(
            target,
            progress.targets[target.id].lat!,
            progress.targets[target.id].lng!,
          ),
        ),
        target.id,
      ]),
    );
    let pendingHere = 0;
    for (const task of tasks) {
      const id = task.query ? byQuery.get(matchKey(task.query)) : undefined;
      if (!id) continue;
      const target = targetsById.get(id)!;
      const entry = progress.targets[id];
      const status = (task.status || '').toLowerCase();
      if (status === 'completed' && task.output) {
        recordCompletion(entry, task);
        await saveReport(target, entry, task);
        console.log(`  adopted ${id} (${entry.words} words)`);
      } else if (status === 'failed' || status === 'cancelled') {
        entry.status = 'pending';
        delete entry.batchId;
      } else {
        pendingHere += 1;
      }
    }
    if (pendingHere) {
      outstanding.push({ batchId, targets: members, byQuery, key: workingKey });
      console.log(`  ${batchId}: ${pendingHere} still running`);
    }
    await saveProgress(progress);
  }
  return outstanding;
}

interface OpenBatch {
  batchId: string;
  targets: Target[];
  byQuery: Map<string, string>;
  key?: string;
}

async function createBatch(
  chunk: Target[],
  progress: Progress,
): Promise<OpenBatch | null> {
  const queries: string[] = [];
  const byQuery = new Map<string, string>();
  const included: Target[] = [];
  for (const target of chunk) {
    const entry = progress.targets[target.id];
    try {
      if (entry.lat === undefined || entry.lng === undefined) {
        const coordinates = await geocode(target);
        entry.lat = coordinates.lat;
        entry.lng = coordinates.lng;
      }
    } catch (error) {
      entry.status = 'failed';
      entry.error = redact(error);
      console.error(`  geocode failed for ${target.id}`);
      continue;
    }
    const query = buildPrompt(target, entry.lat!, entry.lng!);
    queries.push(query);
    byQuery.set(matchKey(query), target.id);
    included.push(target);
  }
  if (!queries.length) return null;

  const name = `global-fail-map-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')}`;
  const result = (await valyu([
    'batch',
    'create',
    ...queries,
    '--mode',
    'fast',
    '--output-format',
    'markdown',
    '--name',
    name,
  ])) as { batch_id?: string };
  if (!result.batch_id) throw new Error('batch create returned no batch_id');

  for (const target of included) {
    const entry = progress.targets[target.id];
    entry.status = 'running';
    entry.batchId = result.batch_id;
    entry.attempts += 1;
    delete entry.error;
  }
  await saveProgress(progress);
  console.log(
    `  created ${result.batch_id} with ${included.length} tasks: ${included.map((target) => target.id).join(', ')}`,
  );
  return { batchId: result.batch_id, targets: included, byQuery };
}

async function pollBatch(
  batch: OpenBatch,
  targetsById: Map<string, Target>,
  progress: Progress,
): Promise<boolean> {
  const result = (await valyu(
    [
      'batch',
      'tasks',
      batch.batchId,
      '--include-output',
      '-n',
      String(Math.max(CHUNK_SIZE * 2, 100)),
    ],
    batch.key,
  )) as { tasks?: BatchTask[] };
  const tasks = result.tasks || [];
  let outstanding = 0;
  for (const task of tasks) {
    const id = task.query ? batch.byQuery.get(matchKey(task.query)) : undefined;
    if (!id) continue;
    const target = targetsById.get(id);
    const entry = progress.targets[id];
    /* Settled targets are skipped so a finished task is not logged each poll. */
    if (!target || !entry || entry.status === 'completed' || entry.status === 'failed')
      continue;
    const status = (task.status || '').toLowerCase();
    if (status === 'completed' && task.output) {
      recordCompletion(entry, task);
      await saveReport(target, entry, task);
      console.log(`  completed ${id} (${entry.words} words)`);
    } else if (status === 'failed' || status === 'cancelled') {
      entry.status = 'failed';
      entry.error = task.error || status;
      console.error(`  ${status} ${id}`);
    } else {
      outstanding += 1;
    }
  }
  /* A member whose task never reached the batch is requeued rather than left
     running forever when the batch closes around it. */
  const seen = new Set(
    tasks.flatMap((task) =>
      task.query ? [batch.byQuery.get(matchKey(task.query)) || ''] : [],
    ),
  );
  for (const target of batch.targets) {
    const entry = progress.targets[target.id];
    if (entry.status === 'running' && !seen.has(target.id)) {
      entry.status = 'pending';
      delete entry.batchId;
      console.warn(`  ${target.id} never reached ${batch.batchId}, requeued`);
    }
  }
  if (!tasks.length) outstanding = batch.targets.length;
  await saveProgress(progress);
  return outstanding === 0;
}

/**
 * Confirms the key in use can actually read its own tasks before any money is
 * spent. The previous run created 150 tasks under an identity that could not
 * read them back.
 */
async function preflight() {
  try {
    await valyu(['deepresearch', 'list', '-n', '1']);
  } catch (error) {
    throw new Error(
      `Valyu rejected the key from .env.local: ${redact(error)}. Check VALYU_API_KEY.`,
    );
  }
}

async function main() {
  await loadEnvironment();
  apiKey();
  await preflight();

  const targets = await loadTargets();
  const targetsById = new Map(targets.map((target) => [target.id, target]));
  const progress = await loadProgress();
  for (const target of targets) {
    if (!progress.targets[target.id])
      progress.targets[target.id] = { status: 'pending', attempts: 0 };
  }

  const counts = () => {
    const values = targets.map((target) => progress.targets[target.id].status);
    return {
      completed: values.filter((value) => value === 'completed').length,
      running: values.filter((value) => value === 'running').length,
      pending: values.filter((value) => value === 'pending').length,
      failed: values.filter((value) => value === 'failed').length,
    };
  };

  console.log(`Loaded ${targets.length} targets.`);
  console.log(`Starting state: ${JSON.stringify(counts())}`);

  await adoptStandaloneTasks(targets, progress);
  const adopted = await adoptExistingBatches(targets, targetsById, progress);
  /* Anything still marked running without a live batch is restarted. */
  for (const target of targets) {
    const entry = progress.targets[target.id];
    if (entry.status === 'running' && !entry.batchId) {
      entry.status = 'pending';
      delete entry.taskId;
    }
  }
  await saveProgress(progress);
  console.log(`After adoption: ${JSON.stringify(counts())}`);

  const limit = Number(process.env.LIMIT || 0);
  let queue = targets.filter(
    (target) => progress.targets[target.id].status === 'pending',
  );
  if (limit) queue = queue.slice(0, limit);
  console.log(`Queue: ${queue.length} targets, chunks of ${CHUNK_SIZE}\n`);

  const open: OpenBatch[] = [...adopted];
  while (queue.length || open.length) {
    while (open.length < MAX_BATCHES && queue.length) {
      const chunk = queue.splice(0, CHUNK_SIZE);
      console.log(`Creating batch for ${chunk.length} targets...`);
      try {
        const batch = await createBatch(chunk, progress);
        if (batch) open.push(batch);
      } catch (error) {
        console.error(`  batch create failed: ${redact(error)}. Retrying in 60s.`);
        queue.unshift(...chunk);
        for (const target of chunk) {
          const entry = progress.targets[target.id];
          if (entry.status === 'running' && !entry.batchId)
            entry.status = 'pending';
        }
        await sleep(60000);
      }
    }
    if (!open.length) break;

    await sleep(POLL_INTERVAL_MS);
    for (let index = open.length - 1; index >= 0; index -= 1) {
      try {
        if (await pollBatch(open[index], targetsById, progress)) {
          console.log(`Batch ${open[index].batchId} finished. ${JSON.stringify(counts())}\n`);
          open.splice(index, 1);
        }
      } catch (error) {
        console.warn(`  poll error on ${open[index].batchId}: ${redact(error)}`);
      }
    }
  }

  await saveProgress(progress);
  const final = counts();
  const spend = targets.reduce(
    (total, target) => total + (progress.targets[target.id].cost || 0),
    0,
  );
  console.log(`\nFinished. ${JSON.stringify(final)}`);
  console.log(`Recorded spend: $${spend.toFixed(2)}`);
  const failed = targets.filter(
    (target) => progress.targets[target.id].status === 'failed',
  );
  if (failed.length) {
    console.log('\nFailed targets:');
    for (const target of failed)
      console.log(`  ${target.id}: ${progress.targets[target.id].error}`);
  }
}

main().catch((error) => {
  console.error('Batch research failed:', redact(error));
  process.exit(1);
});
