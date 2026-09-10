import type { Category } from './types';

const symbols = {
  plane: ['M10 3h4v7l7 4v3l-7-2v4l3 2H7l3-2v-4l-7 2v-3l7-4V3Z'],
  pill: [
    'M5 19a5 5 0 0 1 0-7l7-7a5 5 0 0 1 7 7l-7 7a5 5 0 0 1-7 0Z',
    'm8 9 7 7',
  ],
  trial: ['M10 3v7l-5 8q-1 3 2 3h10q3 0 2-3l-5-8V3Z', 'M9 3h6', 'M8 15h8'],
  car: [
    'M4 15V9l3-5h10l3 5v6H4Z',
    'M4 10h16',
    'M6 15v4',
    'M18 15v4',
    'M7 12h1',
    'M16 12h1',
  ],
  building: ['M5 21V3h14v18H5Z', 'M9 7h1m4 0h1M9 11h1m4 0h1', 'M10 21v-6h4v6'],
  leaf: ['M4 19C-1 7 9 2 21 3c0 12-5 20-17 16Z', 'M4 20 15 9'],
  rocket: [
    'M9 15 6 9C9 4 15 2 21 3c1 6-1 12-6 15l-6-3Z',
    'M9 15 5 19',
    'M6 9H3v6h6',
    'M15 18v3H9v-6',
    'm15 8 1 1',
  ],
  atom: [
    'M3 12c0-3 18-3 18 0s-18 3-18 0Z',
    'M8 4c3-2 12 14 8 16S4 6 8 4Z',
    'M16 4c4 2-5 18-8 16S13 2 16 4Z',
  ],
  factory: ['M3 21V9l6 4V9l6 4V3h4v18H3Z', 'M7 17h1m4 0h1m3 0h1'],
  circuit: [
    'M6 6h12v12H6Z',
    'M10 10h4v4h-4Z',
    'M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4M18 9h4m-4 6h4',
  ],
  balloon: ['M5 8a7 7 0 1 1 14 0c0 5-7 9-7 9S5 13 5 8Z', 'M9 19h6l-1 3h-4Z'],
  patent: ['M5 3h10l4 4v14H5V3Z', 'M14 3v5h5', 'M9 12h6m-6 4h4'],
  bridge: ['M3 20V4m18 16V4M3 9q9 11 18 0M3 18h18', 'M7 13v5m5-3v3m5-5v5'],
  power: ['M13 2 4 14h7l-1 8 10-13h-7l1-7Z'],
  search: ['M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z', 'm15 15 6 6'],
  /* Reads as "several things", so a cluster stops impersonating its first member. */
  cluster: [
    'M12 2 22 7.5 12 13 2 7.5 12 2Z',
    'm2 12 10 5.5L22 12',
    'm2 16.5 10 5.5 10-5.5',
  ],
} as const;

type SymbolName = keyof typeof symbols;

const caseSymbols: Record<string, SymbolName> = {
  fordlandia: 'leaf',
  concorde: 'plane',
  babbage: 'circuit',
  theranos: 'trial',
  juicero: 'leaf',
  delorean: 'car',
  unk: 'atom',
  monju: 'power',
  'new-harmony': 'building',
  'new-australia': 'building',
  'french-panama': 'bridge',
  cargolifter: 'balloon',
  europa: 'rocket',
  'tata-nano': 'car',
  biosphere2: 'leaf',
  cybersyn: 'circuit',
  hvtn702: 'trial',
  ssc: 'atom',
  ajaokuta: 'factory',
  'better-place': 'car',
  exubera: 'pill',
  torcetrapib: 'trial',
  verubecestat: 'trial',
  bapineuzumab: 'trial',
  aduhelm: 'pill',
  loon: 'balloon',
  'argo-ai': 'car',
  'fisker-ocean': 'car',
  'dyson-ev': 'patent',
  'apple-airpower': 'patent',
  'keystone-xl': 'bridge',
  'texcoco-airport': 'plane',
};

const categorySymbols: Record<Category | 'general', SymbolName> = {
  general: 'search',
  all: 'search',
  companies: 'building',
  infrastructure: 'bridge',
  science: 'trial',
  technology: 'circuit',
  visions: 'rocket',
};

export function mapSymbolPaths(id: string, category: Category | 'general') {
  return symbols[caseSymbols[id] || categorySymbols[category]];
}

export function resolveSymbolName(id: string, category: Category | 'general') {
  return caseSymbols[id] || categorySymbols[category];
}

/**
 * The glyph a grouped marker wears. Drawing the first member's symbol made a
 * cluster of seven look like one science pin, so groups get their own mark.
 */
export function createClusterSymbol() {
  return buildMapSymbol('cluster');
}

let symbolSequence = 0;

export function createMapSymbol(id: string, category: Category | 'general') {
  return buildMapSymbol(caseSymbols[id] || categorySymbols[category]);
}

function buildMapSymbol(name: SymbolName) {
  const paths = symbols[name];
  const solid = !['atom', 'bridge', 'search'].includes(name);
  const gradientId = `map-symbol-${++symbolSequence}`;
  const element = (tag: string, attributes: Record<string, string>) => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attributes)) {
      node.setAttribute(key, value);
    }
    return node;
  };
  const svg = element('svg', {
    viewBox: '-2 -2 29 29',
    fill: 'none',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
  });
  const defs = element('defs', {});
  const gradient = element('linearGradient', {
    id: gradientId,
    x1: '0%',
    y1: '0%',
    x2: '70%',
    y2: '100%',
  });
  for (const [offset, color] of [
    ['0%', 'var(--pin-highlight)'],
    ['45%', 'var(--pin-face)'],
    ['100%', 'var(--pin-shade)'],
  ]) {
    gradient.appendChild(element('stop', { offset, 'stop-color': color }));
  }
  defs.appendChild(gradient);
  svg.appendChild(defs);
  const silhouette = solid ? paths.slice(0, 1) : paths;
  const side = element('g', { transform: 'translate(0.8 1.6)' });
  for (const d of silhouette) {
    side.appendChild(
      element('path', {
        d,
        fill: solid ? 'var(--pin-side)' : 'none',
        stroke: 'var(--pin-side)',
        'stroke-width': '2.5',
      }),
    );
  }
  svg.appendChild(side);
  paths.forEach((d, index) => {
    const detail = solid && index > 0;
    svg.appendChild(
      element('path', {
        d,
        fill: solid && !detail ? `url(#${gradientId})` : 'none',
        stroke: detail ? 'var(--pin-detail)' : `url(#${gradientId})`,
        'stroke-width': detail ? '1.3' : '1.8',
      }),
    );
  });
  return svg;
}
