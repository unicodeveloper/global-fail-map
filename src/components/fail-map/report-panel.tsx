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
import { ResearchProgress, type ResearchConnection } from './research-progress';
import { ProjectPhotoGallery } from './project-photo-gallery';
import { projectPhotoSubjects } from '@/lib/project-images';
import seededPhotos from '@/data/project-photos.json';
import {
  prepareReport,
  reportMarkdown,
  sourceHostname,
  sourceTitle,
} from './report-utils';
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
  researchConnection?: ResearchConnection;
  publicReport?: boolean;
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
  researchConnection,
  publicReport = false,
}: ReportPanelProps) {
  const [markdown, setMarkdown] = useState('');
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(false);
  const [shareState, setShareState] = useState<'idle' | 'loading' | 'copied'>(
    'idle',
  );
  const [shareError, setShareError] = useState('');
  const [sharedUrl, setSharedUrl] = useState('');
  const [sharingOpen, setSharingOpen] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [mobileMapOpen, setMobileMapOpen] = useState(false);
  const [desktopMapOpen, setDesktopMapOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const shareRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sharingOpen) return;
    const dismiss = (event: PointerEvent) => {
      if (!shareRef.current?.contains(event.target as Node))
        setSharingOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [sharingOpen]);

  useEffect(() => {
    setShareState('idle');
    setShareError('');
    setSharedUrl('');
    setSharingOpen(false);
    setIsPublic(investigation?.isPublic === true);
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
  }, [example, investigation?.id, investigation?.isPublic]);

  if (!example && !investigation) return null;

  const title = example?.title || investigation?.location.name || 'Research';
  const content = example ? markdown : investigation?.report || '';
  const { body, sources } = prepareReport(
    content,
    example?.sources || investigation?.sources || [],
  );
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
    if (!example && !publicReport) {
      setSharingOpen((open) => !open);
      if (isPublic && investigation)
        setSharedUrl(
          `${window.location.origin}/?share=${encodeURIComponent(investigation.id)}`,
        );
      return;
    }
    setShareState('loading');
    setShareError('');
    const url = `${window.location.origin}/?${example ? `case=${encodeURIComponent(example.id)}` : `share=${encodeURIComponent(investigation!.id)}`}`;
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

  async function copyPublicLink() {
    if (!investigation) return;
    const url = `${window.location.origin}/?share=${encodeURIComponent(investigation.id)}`;
    setSharedUrl(url);
    try {
      await navigator.clipboard.writeText(url);
      setShareState('copied');
    } catch {
      setShareError('Copy the public link above.');
    }
  }

  async function setVisibility(makePublic: boolean) {
    if (!investigation) return;
    setShareState('loading');
    setShareError('');
    try {
      const response = await fetch(
        `/api/investigations/${encodeURIComponent(investigation.id)}/share`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ public: makePublic }),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.message || 'Could not update sharing. Please try again.',
        );
      setIsPublic(makePublic);
      const url = makePublic
        ? `${window.location.origin}/?share=${encodeURIComponent(investigation.id)}`
        : '';
      setSharedUrl(url);
      setShareState('idle');
      if (url && navigator.clipboard && window.isSecureContext) {
        try {
          await navigator.clipboard.writeText(url);
          setShareState('copied');
        } catch {
          /* The visible link remains available to copy. */
        }
      }
    } catch (error) {
      setShareError(
        error instanceof Error ? error.message : 'Could not update sharing.',
      );
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
        onEscapeKeyDown={(event) => {
          if (sharingOpen) {
            event.preventDefault();
            setSharingOpen(false);
          }
        }}
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
            {(example || investigation?.status === 'completed') && (
              <div
                className="dossier-share-control"
                ref={shareRef}
                onKeyDown={(event) => {
                  if (event.key === 'Escape' && sharingOpen) {
                    event.preventDefault();
                    event.stopPropagation();
                    setSharingOpen(false);
                  }
                }}
              >
                <button
                  className="dossier-tool"
                  onClick={share}
                  disabled={shareState === 'loading'}
                  aria-label={
                    shareState === 'copied' ? 'Link copied' : 'Share report'
                  }
                  aria-expanded={
                    example || publicReport ? undefined : sharingOpen
                  }
                  aria-controls={sharingOpen ? 'report-sharing' : undefined}
                >
                  {shareState === 'copied' ? (
                    <Check size={17} />
                  ) : (
                    <Link2 size={17} />
                  )}
                  <span>{shareState === 'copied' ? 'Copied' : 'Share'}</span>
                </button>
                {sharingOpen && !publicReport && (
                  <div
                    className="dossier-sharing"
                    id="report-sharing"
                    role="region"
                    aria-label="Report sharing"
                  >
                    <strong>{isPublic ? 'Public link' : 'Share report'}</strong>
                    <p>
                      {isPublic
                        ? 'Anyone with the link can read this report.'
                        : 'Make the report and research query visible to anyone with the link.'}
                    </p>
                    {isPublic && (
                      <input
                        aria-label="Public report link"
                        readOnly
                        value={sharedUrl}
                        onFocus={(event) => event.target.select()}
                      />
                    )}
                    <button
                      className="dossier-share-primary"
                      disabled={shareState === 'loading'}
                      onClick={() =>
                        void (isPublic ? copyPublicLink() : setVisibility(true))
                      }
                    >
                      <Link2 size={14} />
                      {shareState === 'loading'
                        ? 'Creating link...'
                        : shareState === 'copied'
                          ? 'Copied'
                          : isPublic
                            ? 'Copy link'
                            : 'Create public link'}
                    </button>
                    {isPublic && (
                      <button
                        className="dossier-share-revoke"
                        disabled={shareState === 'loading'}
                        onClick={() => void setVisibility(false)}
                      >
                        Turn sharing off
                      </button>
                    )}
                    {shareError && <p role="alert">{shareError}</p>}
                  </div>
                )}
              </div>
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
                {sharedUrl && (example || publicReport) && (
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
                <ResearchProgress
                  investigation={investigation}
                  connection={researchConnection}
                />
              )}
              <ProjectPhotoGallery
                projectName={title}
                locationName={example ? location : undefined}
                subjects={
                  example ? undefined : projectPhotoSubjects(content, title)
                }
                initialImages={
                  example
                    ? seededPhotos[example.id as keyof typeof seededPhotos]
                    : undefined
                }
                autoLoad={!publicReport}
              />
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
