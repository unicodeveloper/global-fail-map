'use client';

import { useEffect, useState } from 'react';
import {
  Check,
  Circle,
  Clock3,
  FileText,
  LoaderCircle,
  Pause,
  Search,
  WifiOff,
} from 'lucide-react';
import type { Investigation } from './types';
import { SourceFavicon } from './source-favicon';
import './research-progress.css';

export type ResearchConnection = 'connecting' | 'live' | 'reconnecting';

export function ResearchProgress({
  investigation,
  connection = 'live',
}: {
  investigation: Investigation;
  connection?: ResearchConnection;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const queued = investigation.status === 'queued';
  const paused = ['paused', 'awaiting_input'].includes(investigation.status);
  const reconnecting = connection === 'reconnecting';
  const active = !paused && !reconnecting;
  const start = Date.parse(investigation.createdAt);
  const seconds = Number.isFinite(start)
    ? Math.max(0, Math.floor((now - start) / 1000))
    : 0;
  const elapsed = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  const title = reconnecting
    ? 'Reconnecting to research'
    : paused
      ? investigation.status === 'awaiting_input'
        ? 'Research needs your input'
        : 'Research paused'
      : queued
        ? 'Your research is queued'
        : 'Following the evidence';
  const description = reconnecting
    ? 'Updates are interrupted. Reconnecting automatically.'
    : paused
      ? 'Open this task in Valyu to continue your research.'
      : queued
        ? 'Waiting for research to begin.'
        : 'Searching sources and building your report.';
  const progress = investigation.progress;
  const Icon = reconnecting
    ? WifiOff
    : paused
      ? Pause
      : queued
        ? Clock3
        : Search;
  const domains = [
    ...new Map(
      investigation.sources.map((source) => {
        try {
          return [new URL(source.url).hostname, source] as const;
        } catch {
          return ['', source] as const;
        }
      }),
    ).values(),
  ].slice(0, 4);

  return (
    <section
      className={`research-progress${active ? ' is-active' : ''}`}
      aria-label="Research progress"
    >
      <div className="research-progress-top">
        <div className="research-progress-orbit" aria-hidden="true">
          <LoaderCircle
            className="research-progress-spinner"
            size={48}
            strokeWidth={1}
          />
          <Icon size={19} strokeWidth={1.6} />
        </div>
        <div role="status" aria-live="polite">
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <span
          className="research-elapsed"
          aria-label={`${elapsed} since research was created`}
        >
          {elapsed}
        </span>
      </div>
      <div className="research-progress-details">
        <span>
          {investigation.totalSteps !== undefined
            ? `${investigation.currentStep} of ${investigation.totalSteps} research steps`
            : queued
              ? 'Waiting to start'
              : paused
                ? 'Waiting to resume'
                : 'Research in progress'}
        </span>
        {progress !== undefined && <span>{progress}%</span>}
      </div>
      <div
        className={`research-progress-meter${progress === undefined ? ' is-indeterminate' : ''}`}
        role="progressbar"
        aria-label="Research steps completed"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
      >
        <span
          style={progress !== undefined ? { width: `${progress}%` } : undefined}
        />
      </div>
      <ol className="research-stages" aria-label="Report lifecycle">
        <li className={queued ? 'is-current' : 'is-done'}>
          {queued ? <Clock3 size={14} /> : <Check size={14} />}
          <span>Queued</span>
        </li>
        <li className={!queued ? 'is-current' : ''}>
          {!queued && active ? (
            <LoaderCircle className="research-stage-spinner" size={14} />
          ) : (
            <Circle size={14} />
          )}
          <span>Researching</span>
        </li>
        <li>
          <FileText size={14} />
          <span>Report ready</span>
        </li>
      </ol>
      {investigation.sources.length > 0 && (
        <a className="research-source-discovery" href="#dossier-sources">
          <span className="research-source-icons">
            {domains.map((source) => (
              <SourceFavicon key={source.url} url={source.url} size={18} />
            ))}
          </span>
          <span>{investigation.sources.length} sources found</span>
        </a>
      )}
      <div className="research-progress-footer">
        {paused ? (
          <a
            href="https://platform.valyu.ai"
            target="_blank"
            rel="noopener noreferrer"
          >
            Continue in Valyu ↗
          </a>
        ) : (
          <>
            <span className="research-saved-dot" />
            You can leave this view. Find your report in My research.
          </>
        )}
      </div>
    </section>
  );
}
