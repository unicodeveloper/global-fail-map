import type { Location } from './types';

const placeTypes = [
  'country',
  'region',
  'place',
  'locality',
  'district',
] as const;
type PlaceType = (typeof placeTypes)[number];
type RecordValue = Record<string, unknown>;
interface Place {
  type: PlaceType;
  name: string;
}

export const mapGeocodingTypes = placeTypes.join(',');

function record(value: unknown): RecordValue | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as RecordValue)
    : undefined;
}

function placeType(feature: RecordValue): PlaceType | undefined {
  const types = Array.isArray(feature.place_type) ? feature.place_type : [];
  const idType = typeof feature.id === 'string' ? feature.id.split('.')[0] : '';
  return placeTypes.find((type) => types.includes(type) || type === idType);
}

function nonempty(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function place(
  feature: RecordValue,
  parents: RecordValue[] = [],
): Place | undefined {
  const type = placeType(feature);
  const name =
    nonempty(feature.place_name) ||
    [
      ...new Set(
        [
          nonempty(feature.text),
          ...parents.map((parent) => nonempty(parent.text)),
        ].filter(Boolean),
      ),
    ].join(', ');
  return type && (nonempty(feature.place_name) || nonempty(feature.text))
    ? { type, name }
    : undefined;
}

export function resolveMapLocation(
  response: unknown,
  point: { latitude: number; longitude: number; zoom: number },
): Location {
  const features = record(response)?.features;
  const direct: Place[] = [];
  const context: Place[] = [];

  for (const value of Array.isArray(features) ? features : []) {
    const feature = record(value);
    if (!feature) continue;
    const parents = (Array.isArray(feature.context) ? feature.context : [])
      .map(record)
      .filter((parent): parent is RecordValue =>
        Boolean(parent && placeType(parent)),
      );
    const candidate = place(feature, parents);
    if (candidate) direct.push(candidate);
    parents.forEach((parent, index) => {
      const candidate = place(parent, parents.slice(index + 1));
      if (candidate) context.push(candidate);
    });
  }

  const zoom = Number.isFinite(point.zoom) ? point.zoom : 0;
  const preferred: PlaceType[] =
    zoom < 5
      ? ['country']
      : zoom < 7
        ? ['country', 'region']
        : zoom < 10
          ? ['region', 'place']
          : [...placeTypes];
  const selected =
    direct.find((candidate) => preferred.includes(candidate.type)) ||
    context.find((candidate) => preferred.includes(candidate.type)) ||
    direct[0] ||
    context[0];

  return {
    name:
      selected?.name ||
      `${point.latitude.toFixed(3)}, ${point.longitude.toFixed(3)}`,
    latitude: point.latitude,
    longitude: point.longitude,
    scope: 'location',
  };
}
