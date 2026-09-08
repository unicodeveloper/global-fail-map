export const categories = [
  { id: 'all', label: 'Everything', color: '#f18a57' },
  { id: 'companies', label: 'Companies', color: '#f18a57' },
  { id: 'infrastructure', label: 'Megaprojects', color: '#d4be79' },
  { id: 'science', label: 'Science', color: '#a8cba1' },
  { id: 'technology', label: 'Technology', color: '#90b8d5' },
  { id: 'visions', label: 'Visions', color: '#bf9ed3' },
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
  period: string;
  year: number;
  summary: string;
  lesson: string;
  locationRole: string;
  confidence: string;
  reportPath: string;
  sources: Source[];
}

export const categoryInfo = (category: string) => categories.find((item) => item.id === category) || categories[0];

export function formatCoordinates(latitude: number, longitude: number) {
  return `${Math.abs(latitude).toFixed(2)}° ${latitude < 0 ? 'S' : 'N'}  /  ${Math.abs(longitude).toFixed(2)}° ${longitude < 0 ? 'W' : 'E'}`;
}
import type { Investigation } from '@/lib/fail-map-types';

export type { Investigation };
