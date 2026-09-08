'use client';

import {
  BookOpen,
  Check,
  Lightbulb,
  LoaderCircle,
  PenLine,
  Search,
  Wrench,
} from 'lucide-react';
import type { InvestigationActivity } from '@/lib/fail-map-types';
import { SourceFavicon } from './source-favicon';

const activityIcons = {
  thought: Lightbulb,
  search: Search,
  read: BookOpen,
  write: PenLine,
  tool: Wrench,
};

export function ResearchActivity({
  activity,
  live,
}: {
  activity: InvestigationActivity[];
  live: boolean;
}) {
  if (!activity.length) return null;
  return (
    <section className="research-activity" aria-label="Research activity">
      <div className="research-activity-heading">
        <h4>Research activity</h4>
        <span role="status" aria-live="polite">
          {activity.length} updates
        </span>
      </div>
      <ol>
        {activity.map((step) => {
          const Icon = activityIcons[step.type];
          const running = step.status === 'running' && live;
          return (
            <li key={step.id} className={running ? 'is-running' : ''}>
              <div className="research-activity-marker" aria-hidden="true">
                <Icon size={15} />
              </div>
              <div className="research-activity-card">
                <div className="research-activity-title">
                  <h5>{step.title}</h5>
                  {running ? (
                    <LoaderCircle
                      className="research-stage-spinner"
                      size={13}
                      aria-label="In progress"
                    />
                  ) : step.status === 'completed' ? (
                    <Check size={13} aria-label="Complete" />
                  ) : null}
                </div>
                {step.detail && (
                  <p className="research-activity-detail">{step.detail}</p>
                )}
                {!!step.sources?.length && (
                  <details className="research-activity-sources">
                    <summary>{step.sources.length} sources found</summary>
                    <div>
                      {step.sources.map((source) => (
                        <a
                          key={source.url}
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <SourceFavicon url={source.url} size={15} />
                          <span>{source.title}</span>
                        </a>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
