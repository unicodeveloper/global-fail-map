import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const outputsDir = path.join(__dirname, 'outputs');
const reportPath = path.join(__dirname, 'anchor-audit.json');

/**
 * Confirms each report's anchor really sits in the country it claims. Several
 * country names are also town names elsewhere, so "Amulsar, Armenia" resolved
 * to Armenia in Colombia and put every Armenian case in South America. Reverse
 * geocoding each anchor catches that class of error.
 */

async function loadEnvironment() {
  try {
    const raw = await readFile(path.join(rootDir, '.env.local'), 'utf8');
    for (const line of raw.split('\n')) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (match)
        process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
    }
  } catch {
    /* Fall back to the ambient environment. */
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function reverse(
  latitude: number,
  longitude: number,
): Promise<string | null> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?access_token=${token}&types=country&limit=1`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      features?: { text?: string; place_name?: string }[];
    };
    return data.features?.[0]?.text || null;
  } catch {
    return null;
  }
}

/** Names Mapbox and the target list spell differently. */
const aliases: Record<string, string[]> = {
  'united states': ['united states', 'usa', 'united states of america'],
  'united kingdom': ['united kingdom', 'uk', 'great britain'],
  'dr congo': ['dr congo', 'democratic republic of the congo', 'congo'],
  'south korea': ['south korea', 'republic of korea', 'korea'],
  'north korea': ['north korea', "democratic people's republic of korea"],
  czechia: ['czechia', 'czech republic'],
  'czech republic': ['czech republic', 'czechia'],
  turkey: ['turkey', 'türkiye', 'turkiye'],
  'ivory coast': ['ivory coast', "côte d'ivoire"],
  myanmar: ['myanmar', 'burma'],
  'cape verde': ['cape verde', 'cabo verde'],
};

function matches(expected: string, actual: string): boolean {
  const left = expected.trim().toLowerCase();
  const right = actual.trim().toLowerCase();
  if (left === right) return true;
  const list = aliases[left] || [];
  if (list.includes(right)) return true;
  const reverseList = aliases[right] || [];
  return reverseList.includes(left);
}

async function main() {
  await loadEnvironment();
  const files = (await readdir(outputsDir))
    .filter((name) => name.endsWith('.json'))
    .sort();

  const wrong: Record<string, unknown> = {};
  let checked = 0;
  let unknown = 0;
  for (const file of files) {
    const sidecar = JSON.parse(
      await readFile(path.join(outputsDir, file), 'utf8'),
    ) as {
      id: string;
      country: string;
      locationName: string;
      latitude: number;
      longitude: number;
    };
    const actual = await reverse(sidecar.latitude, sidecar.longitude);
    await sleep(120);
    checked += 1;
    if (!actual) {
      unknown += 1;
      continue;
    }
    if (!matches(sidecar.country, actual)) {
      wrong[sidecar.id] = {
        expected: sidecar.country,
        actual,
        locationName: sidecar.locationName,
        latitude: sidecar.latitude,
        longitude: sidecar.longitude,
      };
      console.log(
        `  ${sidecar.id}: expected ${sidecar.country}, anchor is in ${actual} (${sidecar.locationName})`,
      );
    }
  }

  await writeFile(reportPath, `${JSON.stringify(wrong, null, 2)}\n`);
  console.log(`\nchecked ${checked} anchors`);
  console.log(`in the wrong country: ${Object.keys(wrong).length}`);
  console.log(`could not resolve: ${unknown}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
