'use client';

import { Children, useEffect, useRef, useState, type ReactNode } from 'react';
import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Link2,
  Map as MapIcon,
  MapPin,
  Search,
} from 'lucide-react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { SourceFavicon } from './source-favicon';
import { reportMarkdown, sourceHostname, sourceTitle } from './report-utils';
import {
  formatCoordinates,
  type FailExample,
  type Investigation,
  type Source,
} from './types';
import './report.css';

interface ReportPanelProps {
  example: FailExample | null;
  investigation: Investigation | null;
  onClose: () => void;
  onResearch: () => void;
  onRetry: () => void;
  map?: ReactNode;
}

function SourceRow({ source, index }: { source: Source; index: number }) {
  return (
    <a
      className="dossier-source"
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
    >
      <span className="dossier-source-index">
        {String(index + 1).padStart(2, '0')}
      </span>
      <SourceFavicon url={source.url} size={20} />
      <span className="dossier-source-copy">
        <strong>{sourceTitle(source)}</strong>
        <span>{sourceHostname(source.url)}</span>
      </span>
      <ExternalLink size={14} aria-hidden="true" />
    </a>
  );
}

export function ReportPanel({
  example,
  investigation,
  onClose,
  onResearch,
  onRetry,
  map,
}: ReportPanelProps) {
  const [markdown, setMarkdown] = useState('');
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(false);
  const [shareState, setShareState] = useState<'idle' | 'loading' | 'copied'>(
    'idle',
  );
  const [shareError, setShareError] = useState('');
  const [sharedUrl, setSharedUrl] = useState('');
  const [mobileMapOpen, setMobileMapOpen] = useState(false);
  const [desktopMapOpen, setDesktopMapOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setShareState('idle');
    setShareError('');
    setSharedUrl('');
    setMarkdown('');
    setLoadError('');
    setLoading(false);
    setMobileMapOpen(false);
    scrollRef.current?.scrollTo({ top: 0 });
    if (!example) return;
    const controller = new AbortController();
    setLoading(true);
    fetch(example.reportPath, { signal: controller.signal })
      .then((response) => {
        if (!response.ok)
          throw new Error(
            'The report could not be loaded. Please try opening it again.',
          );
        return response.text();
      })
      .then(setMarkdown)
      .catch((error: Error) => {
        if (error.name !== 'AbortError') setLoadError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [example, investigation?.id]);

  if (!example && !investigation) return null;

  const title = example?.title || investigation?.location.name || 'Research';
  const content = example ? markdown : investigation?.report || '';
  const body = content.replace(/^# [^\n]+\n\s*/, '');
  const sources = example?.sources || investigation?.sources || [];
  const sourceByUrl = new Map(sources.map((source) => [source.url, source]));
  const running =
    investigation &&
    !['completed', 'failed', 'cancelled'].includes(investigation.status);
  const failed =
    investigation?.status === 'failed' || investigation?.status === 'cancelled';
  const worldwide = investigation?.location.scope === 'worldwide';
  const location = example
    ? `${example.location}, ${example.country}`
    : worldwide
      ? 'Worldwide research'
      : investigation?.location.name;
  const coordinates = example
    ? formatCoordinates(example.lat, example.lng)
    : investigation && !worldwide
      ? formatCoordinates(
          investigation.location.latitude,
          investigation.location.longitude,
        )
      : '';
  const sections = body.split('\n').flatMap((line, index) => {
    const heading = line.match(/^##\s+(.+)$/);
    return heading
      ? [
          {
            id: `report-section-${index + 1}`,
            title: heading[1].replace(/[*_`]/g, ''),
          },
        ]
      : [];
  });
  const readingMinutes = content
    ? Math.max(1, Math.ceil(content.split(/\s+/).length / 220))
    : 0;

  async function share() {
    if (!example) return;
    setShareState('loading');
    setShareError('');
    const url = `${window.location.origin}/?case=${encodeURIComponent(example.id)}`;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
        setShareState('copied');
      } else {
        setSharedUrl(url);
        setShareState('idle');
      }
    } catch {
      setSharedUrl(url);
      setShareError('Copy the story link below.');
      setShareState('idle');
    }
  }

  function download() {
    const blob = new Blob([reportMarkdown(title, body, sources)], {
      type: 'text/markdown;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${example?.id || 'global-fail-map-report'}.md`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className={`dossier-dialog${mobileMapOpen ? ' is-map-open' : ''}${desktopMapOpen ? '' : ' is-map-collapsed'}${map ? '' : ' without-map'}`}
        showCloseButton={false}
      >
        <header className="dossier-toolbar">
          <DialogClose className="dossier-back">
            <ArrowLeft size={17} />
            <span>Back to atlas</span>
          </DialogClose>
          <span className="dossier-toolbar-title">{title}</span>
          <div className="dossier-toolbar-actions">
            {!running && !failed && (
              <button
                className="dossier-tool"
                onClick={onResearch}
                aria-label="Research this location"
              >
                <Search size={17} />
                <span>Research this location</span>
              </button>
            )}
            {map && (
              <button
                className="dossier-tool dossier-map-toggle"
                onClick={() => setMobileMapOpen(!mobileMapOpen)}
                aria-expanded={mobileMapOpen}
                aria-controls="dossier-context"
              >
                <MapIcon size={17} />
                <span>{mobileMapOpen ? 'Hide map' : 'Map'}</span>
              </button>
            )}
            {example && (
              <button
                className="dossier-tool"
                onClick={share}
                disabled={shareState === 'loading'}
                aria-label={
                  shareState === 'copied'
                    ? 'Story link copied'
                    : 'Copy story link'
                }
              >
                {shareState === 'copied' ? (
                  <Check size={17} />
                ) : (
                  <Link2 size={17} />
                )}
                <span>{shareState === 'copied' ? 'Copied' : 'Share'}</span>
              </button>
            )}
            <button
              className="dossier-tool"
              onClick={download}
              disabled={!content}
              aria-label="Download report with sources"
            >
              <ArrowDownToLine size={17} />
              <span>Download</span>
            </button>
          </div>
        </header>

        <div className="dossier-workspace">
          {map && (
            <aside
              id="dossier-context"
              className="dossier-context"
              aria-label="Report location and facts"
            >
              <div className="dossier-context-label">
                <MapPin size={13} />
                {worldwide ? 'Worldwide' : 'Location'}
              </div>
              <div className="dossier-map">{map}</div>
              <div className="dossier-context-body">
                <p className="dossier-map-location">{location}</p>
                {coordinates && (
                  <p className="dossier-coordinates">{coordinates}</p>
                )}
                {example && (
                  <dl className="dossier-facts">
                    <div>
                      <dt>Status</dt>
                      <dd>{example.status}</dd>
                    </div>
                    <div>
                      <dt>Years</dt>
                      <dd>{example.period}</dd>
                    </div>
                    <div>
                      <dt>Location role</dt>
                      <dd>{example.locationRole}</dd>
                    </div>
                    {example.statusDate && (
                      <div>
                        <dt>Status date</dt>
                        <dd>
                          <time dateTime={example.statusDate}>
                            {example.statusDate}
                          </time>
                        </dd>
                      </div>
                    )}
                    <div>
                      <dt>Confidence</dt>
                      <dd className="dossier-confidence">
                        {example.confidence}
                      </dd>
                    </div>
                  </dl>
                )}
                <a
                  className="dossier-valyu"
                  href="https://valyu.ai"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span>Research by</span>
                  <Image src="/valyu.svg" alt="Valyu" width={61} height={20} />
                </a>
              </div>
            </aside>
          )}
          {map && (
            <button
              className="dossier-map-collapse"
              onClick={() => setDesktopMapOpen(!desktopMapOpen)}
              aria-expanded={desktopMapOpen}
              aria-controls="dossier-context"
              aria-label={desktopMapOpen ? 'Hide map' : 'Show map'}
              title={desktopMapOpen ? 'Hide map' : 'Show map'}
            >
              {desktopMapOpen ? (
                <ChevronLeft size={16} />
              ) : (
                <ChevronRight size={16} />
              )}
            </button>
          )}

          <div className="dossier-scroll" ref={scrollRef}>
            <div className="dossier-reading-column">
              <div className="dossier-heading">
                <DialogTitle className="dossier-title">{title}</DialogTitle>
                <DialogDescription
                  className={example ? 'dossier-description' : 'sr-only'}
                >
                  {example?.summary || `Research report for ${title}.`}
                </DialogDescription>
                <div className="dossier-meta">
                  <span>
                    <MapPin size={13} />
                    {location}
                  </span>
                  {example && <span>{example.period}</span>}
                  {!!readingMinutes && <span>{readingMinutes} min read</span>}
                  {!!sources.length && (
                    <a href="#dossier-sources">
                      {sources.length} sources <ArrowUpRight size={12} />
                    </a>
                  )}
                </div>
                {example && (
                  <dl className="dossier-mobile-facts">
                    <div>
                      <dt>Status</dt>
                      <dd>{example.status}</dd>
                    </div>
                    <div>
                      <dt>Location role</dt>
                      <dd>{example.locationRole}</dd>
                    </div>
                    {example.statusDate && (
                      <div>
                        <dt>Status date</dt>
                        <dd>
                          <time dateTime={example.statusDate}>
                            {example.statusDate}
                          </time>
                        </dd>
                      </div>
                    )}
                    <div>
                      <dt>Confidence</dt>
                      <dd className="dossier-confidence">
                        {example.confidence}
                      </dd>
                    </div>
                  </dl>
                )}
                {sharedUrl && (
                  <div className="dossier-share-link">
                    <label htmlFor="report-share-url">
                      {shareError || 'Public story link'}
                    </label>
                    <input
                      id="report-share-url"
                      readOnly
                      value={sharedUrl}
                      onFocus={(event) => event.target.select()}
                    />
                  </div>
                )}
              </div>

              {loading && (
                <div className="dossier-loading" role="status">
                  <span />
                  <span />
                  <span />
                  <p>Opening the report...</p>
                </div>
              )}
              {loadError && (
                <p className="dossier-error" role="alert">
                  {loadError}
                </p>
              )}
              {running && (
                <div
                  className="dossier-progress"
                  role="status"
                  aria-live="polite"
                >
                  <h3>
                    {investigation.status === 'queued'
                      ? 'Research queued'
                      : 'Researching...'}
                  </h3>
                  <p>This report will be saved in My research.</p>
                  <div className="dossier-progress-track">
                    <span
                      style={{
                        width: `${Math.max(8, Math.min(95, investigation.progress || 18))}%`,
                      }}
                    />
                  </div>
                </div>
              )}
              {failed && (
                <div className="dossier-progress">
                  <h3>The research could not finish.</h3>
                  <p>
                    {investigation?.message ||
                      'Check your connection and account balance, then try again.'}
                  </p>
                  <button className="dossier-primary" onClick={onRetry}>
                    Review and try again <ArrowUpRight size={16} />
                  </button>
                </div>
              )}

              {sections.length > 2 && (
                <details className="dossier-contents">
                  <summary>
                    <span>In this report</span>
                    <span>
                      {sections.length} sections <ChevronDown size={14} />
                    </span>
                  </summary>
                  <nav aria-label="Report sections">
                    {sections.map((section) => (
                      <a key={section.id} href={`#${section.id}`}>
                        {section.title}
                      </a>
                    ))}
                  </nav>
                </details>
              )}

              {content && (
                <article className="dossier-prose">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      h2: ({ node, children }) => (
                        <h2 id={`report-section-${node?.position?.start.line}`}>
                          {children}
                        </h2>
                      ),
                      table: ({ children }) => (
                        <div className="dossier-table-scroll">
                          <table>{children}</table>
                        </div>
                      ),
                      a: ({ href, children }) => {
                        const domain = sourceHostname(href || '');
                        if (!domain) return <a href={href}>{children}</a>;
                        const label = Children.toArray(children).join('');
                        const citation = label.match(
                          /^\[?(\d+(?:[,\s-]+\d+)*)\]?$/,
                        );
                        const source = sourceByUrl.get(href || '');
                        const description = source
                          ? sourceTitle(source)
                          : domain;
                        return (
                          <a
                            className={
                              citation
                                ? 'dossier-citation'
                                : 'dossier-inline-source'
                            }
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={description}
                            aria-label={
                              citation
                                ? `Source ${citation[1]}: ${description}`
                                : undefined
                            }
                          >
                            <SourceFavicon url={href!} size={14} />
                            <span>{citation ? citation[1] : children}</span>
                          </a>
                        );
                      },
                    }}
                  >
                    {body}
                  </ReactMarkdown>
                </article>
              )}

              {!!sources.length && (
                <section className="dossier-sources" id="dossier-sources">
                  <div className="dossier-section-heading">
                    <h2>Sources</h2>
                    <span>{sources.length}</span>
                  </div>
                  {sources.slice(0, 6).map((source, index) => (
                    <SourceRow
                      key={`${source.url}-${index}`}
                      source={source}
                      index={index}
                    />
                  ))}
                  {sources.length > 6 && (
                    <details>
                      <summary>
                        View all {sources.length} sources{' '}
                        <ChevronDown size={14} />
                      </summary>
                      {sources.slice(6).map((source, index) => (
                        <SourceRow
                          key={`${source.url}-${index + 6}`}
                          source={source}
                          index={index + 6}
                        />
                      ))}
                    </details>
                  )}
                </section>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
