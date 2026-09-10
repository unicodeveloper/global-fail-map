import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const casesDir = path.join(__dirname, 'cases');
const outputsDir = path.join(__dirname, 'outputs');
const placesPath = path.join(__dirname, 'case-places.json');

/**
 * Finds a pin for each case. The dossier gives one anchor for a whole city, but
 * a city holds its failures in different places: the Lagos report covers Marina,
 * Ikoyi and Abesan Estate. Each case is located from the places its own text
 * names, and anything that cannot be resolved falls back to the report anchor
 * rather than being dropped.
 */

interface CaseSection {
  id: string;
  reportId: string;
  title: string;
  body: string;
}

interface Place {
  id: string;
  reportId: string;
  latitude: number;
  longitude: number;
  query: string;
  precision: 'case' | 'anchor';
  placeName?: string;
}

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

let lookups = 0;

/* A case belongs to the place its dossier covers. "Abesan Estate" matched a
   road in Kano, 800km from the Lagos it belongs to, so a hit too far from the
   report anchor is rejected and the next candidate tried. */
const MAX_KM = Number(process.env.MAX_KM || 300);

function distanceKm(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): number {
  const radians = (value: number) => (value * Math.PI) / 180;
  const dLat = radians(to.lat - from.lat);
  const dLng = radians(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(from.lat)) *
      Math.cos(radians(to.lat)) *
      Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function geocode(
  query: string,
  country: string,
): Promise<{ lat: number; lng: number; placeName: string } | null> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  if (!token) throw new Error('NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN is not set');
  lookups += 1;
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
    query,
  )}.json?access_token=${token}&limit=5`;
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  } catch {
    return null;
  }
  if (response.status === 429) {
    await sleep(2000);
    return null;
  }
  if (!response.ok) return null;
  const data = (await response.json()) as {
    features?: {
      center: [number, number];
      place_name?: string;
      relevance?: number;
      context?: { text?: string }[];
    }[];
  };
  const wanted = country.toLowerCase();
  for (const feature of data.features || []) {
    /* Mapbox puts the country last. Matching the country name anywhere in the
       string sent a Lagos hotel to "Nigeria Drive, Nassau, Bahamas", so only
       the trailing segment and the context country entry count. */
    const segments = (feature.place_name || '')
      .split(',')
      .map((part) => part.trim().toLowerCase());
    const contextCountry = (feature.context || [])
      .map((entry) => (entry.text || '').toLowerCase())
      .at(-1);
    const tail = segments.at(-1) || '';
    if (!wanted || tail === wanted || contextCountry === wanted) {
      const [lng, lat] = feature.center;
      return { lat, lng, placeName: feature.place_name || query };
    }
  }
  return null;
}

/**
 * Place names the case itself puts forward: what follows a locational
 * preposition, plus capitalised phrases that look like proper nouns. Ordered
 * most specific first, since the first hit inside the right country wins.
 */
function candidates(section: CaseSection): string[] {
  const prose = section.body
    .split('\n')
    .filter((line) => line.trim() && !/^#{1,6}\s/.test(line))
    .join(' ')
    .replace(/\[\[?\d+\]?\]\([^)]*\)/g, '')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ');
  const head = prose.slice(0, 2500);
  const found: string[] = [];

  const proper = String.raw`[A-Z][\w'’-]+(?:\s+(?:of|de|del|da|do|la|le|el|the|dos|das)\s+[A-Z][\w'’-]+|\s+[A-Z][\w'’-]+){0,3}`;
  for (const match of head.matchAll(
    new RegExp(
      String.raw`\b(?:in|at|near|on|along|outside|within)\s+(${proper})`,
      'g',
    ),
  )) {
    found.push(match[1]);
  }
  const prepositionalCount = found.length;
  for (const match of head.matchAll(new RegExp(proper, 'g'))) {
    found.push(match[0]);
  }

  /* Organisations and people are not places. "Lagos State Governor Lateef"
     and "Lagos State Ministry of Health" both geocoded to arbitrary streets. */
  const notAPlace =
    /\b(?:governor|president|minister|ministry|commission|authority|agency|department|bureau|corporation|company|limited|ltd|plc|inc|incorporated|holdings|group|bank|consortium|contractor|administration|government|council|committee|court|tribunal|university|institute(?!\s+of\s+technology)|association|federation|union|party|chief|dr|mr|mrs|professor|engineer|general|colonel|major)\b/i;
  /* Names shaped like somewhere you can stand. */
  const placeShaped =
    /\b(?:street|road|avenue|crescent|close|drive|lane|way|boulevard|estate|island|peninsula|bridge|airport|airfield|port|harbour|harbor|terminal|station|depot|junction|district|quarter|area|zone|plateau|valley|hills?|mountains?|river|lake|bay|beach|creek|lagoon|dam|reservoir|park|square|market|town|city|village|province|state|county|region|corridor|line|mine|field|plant|refinery|works|yard|site|campus|centre|center|complex|towers?|building|hotel|stadium|hospital|school)\b/i;

  const stop =
    /^(?:The|A|An|This|That|These|Those|It|Its|He|She|They|But|And|By|For|From|With|While|When|After|Before|During|Although|However|Despite|Because|Since|Between|Under|Over|Both|Each|Most|Many|Some|All|No|Not|New\s+\w+\s+Times|World\s+Bank|Reuters|Bloomberg|Guardian|Punch|Government|Ministry|Federal|State|President|Governor|Prime|Minister|January|February|March|April|May|June|July|August|September|October|November|December|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/;

  const seen = new Set<string>();
  const ordered: { value: string; score: number }[] = [];
  for (const [index, raw] of found.entries()) {
    const value = raw.replace(/[’']s$/, '').replace(/[’']+$/, '').trim();
    if (value.length < 4 || value.split(/\s+/).length > 5) continue;
    if (stop.test(value) || notAPlace.test(value)) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    /* Prepositional hits come first in `found`, so they keep their priority;
       a place-shaped name outranks a bare capitalised phrase. */
    const prepositional = index < prepositionalCount ? 3 : 0;
    ordered.push({
      value,
      score: prepositional + (placeShaped.test(value) ? 2 : 0),
    });
  }
  return ordered
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.value)
    .slice(0, 6);
}

async function main() {
  await loadEnvironment();
  const files = (await readdir(casesDir))
    .filter((name) => name.endsWith('.json'))
    .sort();

  let places: Record<string, Place> = {};
  try {
    places = JSON.parse(await readFile(placesPath, 'utf8'));
  } catch {
    /* First run. */
  }

  let located = 0;
  let anchored = 0;
  let processed = 0;
  for (const file of files) {
    const reportId = file.replace(/\.json$/, '');
    let anchor: { country: string; latitude: number; longitude: number };
    try {
      anchor = JSON.parse(
        await readFile(path.join(outputsDir, `${reportId}.json`), 'utf8'),
      );
    } catch {
      continue;
    }
    const sections = JSON.parse(
      await readFile(path.join(casesDir, file), 'utf8'),
    ) as CaseSection[];

    for (const section of sections) {
      if (places[section.id]) {
        if (places[section.id].precision === 'case') located += 1;
        else anchored += 1;
        continue;
      }
      let resolved: Place | null = null;
      for (const candidate of candidates(section)) {
        const hit = await geocode(
          `${candidate}, ${anchor.country}`,
          anchor.country,
        );
        await sleep(120);
        if (!hit) continue;
        const away = distanceKm(
          { lat: anchor.latitude, lng: anchor.longitude },
          { lat: hit.lat, lng: hit.lng },
        );
        if (away > MAX_KM) continue;
        resolved = {
          id: section.id,
          reportId,
          latitude: hit.lat,
          longitude: hit.lng,
          query: candidate,
          precision: 'case',
          placeName: hit.placeName,
        };
        break;
      }
      places[section.id] = resolved || {
        id: section.id,
        reportId,
        latitude: anchor.latitude,
        longitude: anchor.longitude,
        query: '',
        precision: 'anchor',
      };
      if (resolved) located += 1;
      else anchored += 1;
      processed += 1;
      if (processed % 25 === 0) {
        await writeFile(placesPath, `${JSON.stringify(places, null, 2)}\n`);
        console.log(
          `  ${located + anchored} placed (${located} located, ${anchored} on the city pin)`,
        );
      }
    }
  }

  await writeFile(placesPath, `${JSON.stringify(places, null, 2)}\n`);
  console.log(`\n${located + anchored} cases placed.`);
  console.log(`  located from the case text: ${located}`);
  console.log(`  fell back to the city pin: ${anchored}`);
  console.log(`  mapbox lookups: ${lookups}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
