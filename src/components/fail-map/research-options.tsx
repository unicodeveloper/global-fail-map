'use client';

import { ChevronDown, Flame, Mail } from 'lucide-react';
import { useId, useState, type CSSProperties } from 'react';
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
  const [ignition, setIgnition] = useState(0);
  const level = researchModes.findIndex((option) => option.value === mode);
  const selected = researchModes[level];
  function selectLevel(index: number) {
    const next = researchModes[index];
    if (!next) return;
    if (next.value === 'heavy' && mode !== 'heavy')
      setIgnition((value) => value + 1);
    onModeChange(next.value);
  }
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
          <div className="research-effort-slider" data-heavy={mode === 'heavy'}>
            <div className="research-effort-heading">
              <span className="research-effort-choice">
                {mode === 'heavy' ? (
                  <Flame size={19} aria-hidden="true" />
                ) : (
                  <span
                    className="effort-bars"
                    data-level={level + 1}
                    aria-hidden="true"
                  >
                    <i />
                    <i />
                    <i />
                  </span>
                )}
                {selected.label}
              </span>
              <span>{selected.estimate}</span>
            </div>
            <div className="research-effort-track">
              <div
                className="research-effort-rail"
                aria-hidden="true"
                style={{ '--effort-fill': `${level * 50}%` } as CSSProperties}
              >
                <span />
              </div>
              <div className="research-effort-stops" aria-hidden="true">
                <i />
                <i />
                <i />
              </div>
              <input
                type="range"
                min={0}
                max={2}
                step={1}
                value={level}
                onChange={(event) => selectLevel(Number(event.target.value))}
                aria-label="Research effort"
                aria-valuetext={`${selected.label} effort, ${selected.estimate}`}
              />
              {ignition > 0 && mode === 'heavy' && (
                <div
                  className="research-effort-ignition"
                  key={ignition}
                  aria-hidden="true"
                >
                  <Flame size={44} />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
              )}
            </div>
            <div className="research-effort-labels">
              {researchModes.map((option, index) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => selectLevel(index)}
                  aria-pressed={mode === option.value}
                >
                  {option.label}
                </button>
              ))}
            </div>
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
