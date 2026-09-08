import type { FailExample } from './types';

export function groupMapExamples(
  examples: FailExample[],
  project: (example: FailExample) => { x: number; y: number },
) {
  const groups: { examples: FailExample[]; point: { x: number; y: number } }[] =
    [];
  for (const example of examples) {
    const point = project(example);
    const nearby = groups.find((group) => {
      const anchor = group.examples[0];
      const longitudeDistance = Math.abs(example.lng - anchor.lng);
      return (
        Math.min(longitudeDistance, 360 - longitudeDistance) < 8 &&
        Math.abs(example.lat - anchor.lat) < 8 &&
        Math.hypot(point.x - group.point.x, point.y - group.point.y) < 34
      );
    });
    if (nearby) nearby.examples.push(example);
    else groups.push({ examples: [example], point });
  }
  return groups.map((group) => group.examples);
}
