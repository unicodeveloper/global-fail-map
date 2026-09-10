'use client';

import { useMemo, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { Dialog, DialogClose, DialogTitle } from '@/components/ui/dialog';
import examples from '@/data/examples.json';
import { categories, type Category, type FailExample } from './types';
import { resolveSymbolName } from './map-symbols';
import { MarkerSymbol } from './marker-symbol';

interface AtlasLegendProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: Category;
  onCategory: (category: Category) => void;
  showPersonal: boolean;
}

const legendCategories = categories.filter((item) => item.id !== 'all');
const categoryLabels = Object.fromEntries(
  legendCategories.map((item) => [item.id, item.label]),
) as Record<(typeof legendCategories)[number]['id'], string>;

export function AtlasLegend(props: AtlasLegendProps) {
  const [hovered, setHovered] = useState<FailExample | null>(null);

  const uniqueIcons = useMemo(() => {
    const seen = new Set<string>();
    return (examples as FailExample[]).filter((example) => {
      const symbol = resolveSymbolName(example.id, example.category);
      const key = `${example.category}:${symbol}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, []);

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange} modal={false}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          className="atlas-legend"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onInteractOutside={(event) => {
            if (
              event.target instanceof Element &&
              event.target.closest('.atlas-dock')
            ) {
              event.preventDefault();
            }
          }}
        >
          <div className="legend-topline">
            <DialogTitle className="legend-title">Marker key</DialogTitle>
            <DialogClose className="icon-button" aria-label="Close marker key">
              <X size={15} />
            </DialogClose>
          </div>
          <div className="legend-grid">
            {uniqueIcons.map((example) => {
              const active = props.category === example.category;
              return (
                <button
                  key={`${example.category}-${example.id}`}
                  className="legend-grid-item"
                  data-map-category={example.category}
                  aria-label={categoryLabels[example.category]}
                  aria-pressed={active}
                  onMouseEnter={() => setHovered(example)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(example)}
                  onBlur={() => setHovered(null)}
                  onClick={() =>
                    props.onCategory(active ? 'all' : example.category)
                  }
                >
                  <MarkerSymbol id={example.id} category={example.category} />
                </button>
              );
            })}
            {props.showPersonal && (
              <span
                className="legend-grid-item is-static"
                data-map-category="personal"
              >
                <MarkerSymbol category="general" />
              </span>
            )}
          </div>
          {hovered && (
            <div
              className="legend-tooltip"
              data-map-category={hovered.category}
            >
              {categoryLabels[hovered.category]}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </Dialog>
  );
}
