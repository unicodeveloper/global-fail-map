'use client';

import { useId } from 'react';
import type { InvestigationInput } from '@/lib/fail-map-types';

const researchModes = [
  { value: 'fast', label: 'Fast', description: 'Quick research' },
  { value: 'standard', label: 'Standard', description: 'Balanced depth' },
  { value: 'heavy', label: 'Heavy', description: 'Deeper analysis' },
] as const;

interface ResearchOptionsProps {
  mode: InvestigationInput['mode'];
  onModeChange: (mode: InvestigationInput['mode']) => void;
  notifyOnCompletion: boolean;
  onNotifyOnCompletionChange: (enabled: boolean) => void;
  notificationEmail?: string;
  notificationAvailable?: boolean;
  disabled?: boolean;
}

export function ResearchOptions({
  mode,
  onModeChange,
  notifyOnCompletion,
  onNotifyOnCompletionChange,
  notificationEmail,
  notificationAvailable = Boolean(notificationEmail),
  disabled = false,
}: ResearchOptionsProps) {
  const id = useId();
  return (
    <div className="my-4">
      <fieldset disabled={disabled} className="m-0 min-w-0 border-0 p-0">
        <legend className="mb-2 text-xs font-medium">Research mode</legend>
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
          {researchModes.map((option) => (
            <label key={option.value} className="relative min-w-0">
              <input
                className="peer sr-only"
                type="radio"
                name={`${id}-mode`}
                value={option.value}
                checked={mode === option.value}
                onChange={() => onModeChange(option.value)}
              />
              <span className="flex min-h-11 cursor-pointer items-center justify-center rounded-md px-2 text-sm text-muted-foreground transition-colors peer-checked:bg-card peer-checked:font-medium peer-checked:text-foreground peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring peer-disabled:cursor-default peer-disabled:opacity-50 motion-reduce:transition-none">
                {option.label}
              </span>
              <span className="sr-only">{option.description}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <p className="mt-2 text-xs text-muted-foreground">
        {mode === 'fast'
          ? 'A quicker look into the evidence.'
          : mode === 'standard'
            ? 'More depth and sources. Takes longer and uses more credits.'
            : 'The deepest investigation. Takes substantially longer and uses more credits.'}
      </p>
      {notificationAvailable && (
        <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={notifyOnCompletion}
            onChange={(event) =>
              onNotifyOnCompletionChange(event.target.checked)
            }
            disabled={disabled}
            aria-describedby={notificationEmail ? `${id}-email` : undefined}
            className="size-4 shrink-0 accent-primary"
          />
          <span className="min-w-0">
            Email me when it’s ready
            {notificationEmail && (
              <span
                id={`${id}-email`}
                className="block truncate text-xs text-muted-foreground"
              >
                {notificationEmail}
              </span>
            )}
          </span>
        </label>
      )}
    </div>
  );
}
