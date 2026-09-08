export const categories = [
  { id: 'all', label: 'Everything' },
  { id: 'companies', label: 'Companies' },
  { id: 'infrastructure', label: 'Megaprojects' },
  { id: 'science', label: 'Science' },
  { id: 'technology', label: 'Technology' },
  { id: 'visions', label: 'Visions' },
] as const;

export type Category = (typeof categories)[number]['id'];
export type Location = Investigation['location'];
export type Source = Investigation['sources'][number];

export interface FailExample {
  id: string;
  title: string;
  subtitle: string;
  location: string;
  country: string;
  lat: number;
  lng: number;
  category: Exclude<Category, 'all'>;
  status: string;
  statusDate?: string;
  period: string;
  year: number;
  summary: string;
  lesson: string;
  locationRole: string;
  confidence: string;
  reportPath: string;
  sources: Source[];
}

export function formatCoordinates(latitude: number, longitude: number) {
  return `${Math.abs(latitude).toFixed(2)}° ${latitude < 0 ? 'S' : 'N'}  /  ${Math.abs(longitude).toFixed(2)}° ${longitude < 0 ? 'W' : 'E'}`;
}
import type { Investigation } from '@/lib/fail-map-types';

export type { Investigation };
