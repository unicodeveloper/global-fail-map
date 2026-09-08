'use client';

import { ChevronDown, Mail } from 'lucide-react';
import { useId } from 'react';
import type { InvestigationInput } from '@/lib/fail-map-types';
import './research-options.css';

const researchModes = [
  { value: 'fast', label: 'Low', estimate: 'About 5 min' },
  { value: 'standard', label: 'Medium', estimate: '10-20 min' },
  { value: 'heavy', label: 'High', estimate: 'About 60 min' },
] as const;

interface ResearchOptionsProps {
  mode: InvestigationInput['mode'];
  onModeChange: (mode: InvestigationInput['mode']) => void;
  notificationAvailable?: boolean;
  disabled?: boolean;
}

export function ResearchOptions({
  mode,
  onModeChange,
  notificationAvailable = false,
  disabled = false,
}: ResearchOptionsProps) {
  const id = useId();
  const selected = researchModes.find((option) => option.value === mode)!;
  return (
    <div className="research-settings">
      <details className="research-advanced">
        <summary>
          <span>Advanced settings</span>
          <span className="research-settings-current">
            {selected.label} effort
          </span>
          <ChevronDown size={15} aria-hidden="true" />
        </summary>
        <fieldset disabled={disabled} aria-describedby={`${id}-estimate`}>
          <legend>Research effort</legend>
          <div className="research-effort-options">
            {researchModes.map((option, index) => (
              <label key={option.value}>
                <input
                  className="sr-only"
                  type="radio"
                  name={`${id}-mode`}
                  value={option.value}
                  checked={mode === option.value}
                  onChange={() => onModeChange(option.value)}
                />
                <span className="research-effort-option" data-level={index + 1}>
                  <span className="effort-bars" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                  <span>{option.label}</span>
                  <small>{option.estimate}</small>
                </span>
              </label>
            ))}
          </div>
          <p id={`${id}-estimate`}>
            Estimated times. Complex topics can take longer.
          </p>
        </fieldset>
      </details>
      {notificationAvailable && (
        <p className="research-email-note">
          <Mail size={14} aria-hidden="true" />
          We’ll email you when it’s ready.
        </p>
      )}
    </div>
  );
}
