import type { Category } from './types';

const symbols = {
  plane: ['M10 3h4v7l7 4v3l-7-2v4l3 2H7l3-2v-4l-7 2v-3l7-4V3Z'],
  pill: [
    'M5 19a5 5 0 0 1 0-7l7-7a5 5 0 0 1 7 7l-7 7a5 5 0 0 1-7 0Z',
    'm8 9 7 7',
  ],
  trial: ['M9 3h6', 'M10 3v7l-5 8q-1 3 2 3h10q3 0 2-3l-5-8V3', 'M8 15h8'],
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

export function createMapSymbol(id: string, category: Category | 'general') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of mapSymbolPaths(id, category)) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  }
  return svg;
}
