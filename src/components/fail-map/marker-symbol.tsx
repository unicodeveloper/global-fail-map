'use client';

import { useEffect, useRef } from 'react';
import type { Category } from './types';
import { createMapSymbol } from './map-symbols';

/**
 * Mounts the very marker the globe draws. Pass the story's id to get its own
 * symbol, as the map does, or omit it for the category's representative mark
 * used by the key.
 */
export function MarkerSymbol({
  id = '',
  category,
}: {
  id?: string;
  category: Category | 'general';
}) {
  const host = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const node = host.current;
    if (!node) return;
    const symbol = createMapSymbol(id, category);
    node.appendChild(symbol);
    return () => symbol.remove();
  }, [id, category]);

  return <span className="marker-swatch" ref={host} aria-hidden="true" />;
}
