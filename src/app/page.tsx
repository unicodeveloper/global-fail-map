import { FailAtlas } from '@/components/fail-map/fail-atlas';
import examples from '@/data/examples.json';
import type { FailExample } from '@/components/fail-map/types';

export default function Home() {
  return <FailAtlas examples={examples as FailExample[]} />;
}
