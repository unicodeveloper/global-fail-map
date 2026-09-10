import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const examplesPath = new URL('../src/data/examples.json', import.meta.url);
const reportsDirectory = new URL('../public/reports/', import.meta.url);
const taskReplacements = new Map([
  [
    'd160d2d3-ddba-4e8c-b6df-d75677c55d7e',
    '4ff3bbaa-a6e1-40b5-aae3-bc4d6e7b8058',
  ],
]);

async function getTask(taskId) {
  const { stdout } = await execFileAsync(
    'valyu',
    ['-q', 'deepresearch', 'status', taskId],
    {
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  return JSON.parse(stdout);
}

function cleanReport(markdown) {
  const sourcesIndex = markdown.search(/\n## Sources\s*\n/i);
  const report = sourcesIndex >= 0 ? markdown.slice(0, sourcesIndex) : markdown;
  return report
    .replaceAll('\u2014', ' - ')
    .replace(/^## A Compelling Opening$/m, '## The promise')
    .trim();
}

const examples = JSON.parse(await readFile(examplesPath, 'utf8'));
await mkdir(reportsDirectory, { recursive: true });

for (const example of examples) {
  const taskId =
    taskReplacements.get(example.deepresearchId) || example.deepresearchId;
  const task = await getTask(taskId);
  if (
    task.status !== 'completed' ||
    typeof task.output !== 'string' ||
    !task.output.trim()
  ) {
    throw new Error(`Example ${example.id} is not complete: ${task.status}`);
  }

  example.deepresearchId = taskId;
  example.deepresearchMode =
    task.mode || example.deepresearchMode || 'standard';
  example.sources = Array.isArray(task.sources)
    ? task.sources.flatMap((source) =>
        source?.url
          ? [
              {
                title: (
                  source.title || new URL(source.url).hostname
                ).replaceAll('\u2014', '-'),
                url: source.url,
              },
            ]
          : [],
      )
    : example.sources;

  const reportPath = new URL(`..${example.reportPath}`, reportsDirectory);
  await writeFile(reportPath, `${cleanReport(task.output)}\n`);
  process.stdout.write(`Synced ${example.id}\n`);
}

await writeFile(examplesPath, `${JSON.stringify(examples, null, 2)}\n`);
