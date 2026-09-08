'use client';

import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowDownToLine, ArrowUpRight, BookOpen, Check, ExternalLink, Link2, MapPin, X } from 'lucide-react';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { categoryInfo, formatCoordinates, type FailExample, type Investigation } from './types';

interface ReportPanelProps {
  example: FailExample | null;
  investigation: Investigation | null;
  onClose: () => void;
  onResearch: () => void;
  onRetry: () => void;
}

export function ReportPanel({ example, investigation, onClose, onResearch, onRetry }: ReportPanelProps) {
  const [markdown, setMarkdown] = useState('');
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(false);
  const [shareState, setShareState] = useState<'idle' | 'loading' | 'copied'>('idle');
  const [shareError, setShareError] = useState('');
  const [sharedUrl, setSharedUrl] = useState('');

  useEffect(() => {
    setShareState('idle');
    setShareError('');
    setSharedUrl('');
    setMarkdown('');
    setLoadError('');
    setLoading(false);
    if (!example) return;
    const controller = new AbortController();
    setLoading(true);
    fetch(example.reportPath, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('The report could not be loaded. Please try opening it again.');
        return response.text();
      })
      .then(setMarkdown)
      .catch((error: Error) => { if (error.name !== 'AbortError') setLoadError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [example, investigation?.id]);

  if (!example && !investigation) return null;
  const title = example?.title || investigation?.location.name || 'Research';
  const color = categoryInfo(example?.category || investigation?.category || 'all');
  const content = example ? markdown : investigation?.report || '';
  const sources = example?.sources || investigation?.sources || [];
  const primarySources = sources.slice(0, 12);
  const remainingSources = sources.slice(12);
  const running = investigation && !['completed', 'failed', 'cancelled'].includes(investigation.status);
  const failed = investigation?.status === 'failed' || investigation?.status === 'cancelled';

  async function share() {
    setShareState('loading');
    setShareError('');
    try {
      let url = '';
      if (example) url = `${window.location.origin}/?case=${encodeURIComponent(example.id)}`;
      setSharedUrl(url);
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
        setShareState('copied');
      } else {
        setShareState('idle');
      }
    } catch (error) {
      setShareError(error instanceof Error ? error.message : 'Could not copy the link.');
      setShareState('idle');
    }
  }

  function download() {
    const blob = new Blob([`# ${title}\n\n${content}\n\n---\nGlobal Fail Map · Research by Valyu\n`], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${example?.id || 'global-fail-map-report'}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="report-dialog translate-x-0 translate-y-0" showCloseButton={false} style={{ '--case-color': color.color } as React.CSSProperties}>
        <div className="report-toolbar"><span className="eyebrow"><BookOpen size={14} /> {example ? 'FROM THE ATLAS' : 'YOUR RESEARCH'}</span><DialogClose className="icon-button" aria-label="Close report"><X size={21} /></DialogClose></div>
        <div className="report-scroll">
          <div className="report-heading">
            <div className="report-kicker"><span className="category-dot" style={{ background: color.color }} /> {color.label} <span>/</span> {example?.period || 'A NEW INVESTIGATION'}</div>
            <DialogTitle className="report-title">{title}</DialogTitle>
            <DialogDescription className="report-description">{example?.subtitle || 'What was attempted, what happened and what we can learn from it.'}</DialogDescription>
            <div className="report-location"><MapPin size={14} />{example ? `${example.location}, ${example.country}` : investigation?.location.name}</div>
            {example && <div className="report-facts"><div><span>OUTCOME</span><strong>{example.status}</strong></div><div><span>LOCATION ROLE</span><strong>{example.locationRole}</strong></div><div><span>CONFIDENCE</span><strong>{example.confidence}</strong></div></div>}
            <div className="report-actions">
              {example && <button className="secondary-button" onClick={share} disabled={shareState === 'loading'}>{shareState === 'copied' ? <Check size={15} /> : <Link2 size={15} />}{shareState === 'copied' ? 'Link copied' : 'Share this story'}</button>}
              <button className="icon-button" onClick={download} disabled={!content} title="Download report as Markdown" aria-label="Download report as Markdown"><ArrowDownToLine size={18} /></button>
              <span className="report-reading-time">{content ? `${Math.max(1, Math.ceil(content.split(/\s+/).length / 220))} MIN READ` : ''}</span>
            </div>
            {sharedUrl && <div className="share-link-box"><label htmlFor="report-share-url">Public story link</label><input id="report-share-url" readOnly value={sharedUrl} onFocus={(event) => event.target.select()} /></div>}
            {shareError && <p className="inline-error" role="alert">{shareError}</p>}
          </div>
          {example?.summary && <p className="report-summary">{example.summary}</p>}
          {loading && <div className="report-loading" role="status"><span className="loading-bar" />Opening the research...</div>}
          {loadError && <p className="inline-error" role="alert">{loadError}</p>}
          {running && <div className="research-progress" role="status" aria-live="polite"><span className="eyebrow">RESEARCH IN PROGRESS</span><h3>Following the evidence.</h3><p>Searching records, connecting sources and putting the story together. You can keep exploring. This report will be in My research.</p><div className="progress-track"><span style={{ width: `${Math.max(8, Math.min(95, investigation.progress || 18))}%` }} /></div><span className="eyebrow">{investigation.status === 'queued' ? 'GETTING STARTED' : 'READING & CROSS-CHECKING SOURCES'}</span></div>}
          {failed && <div className="research-progress"><h3>This research hit a dead end.</h3><p>{investigation?.message || 'The research could not finish. Check your connection and account balance, then try again.'}</p><button className="secondary-button" onClick={onRetry}>Review and try again <ArrowUpRight size={16} /></button></div>}
          {content && <article className="report-prose"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> }}>{content.replace(/^# [^\n]+\n\s*/, '')}</ReactMarkdown></article>}
          {example?.lesson && <aside className="lesson-box"><span className="eyebrow">TAKE THIS FORWARD</span><p>{example.lesson}</p><span>Someone has to try. Make your attempt count.</span></aside>}
          {!!sources.length && <section className="report-sources"><h3>Follow the evidence <span>{sources.length}</span></h3>{primarySources.map((source, index) => <a href={source.url} target="_blank" rel="noopener noreferrer" key={`${source.url}-${index}`}><span className="source-number">{String(index + 1).padStart(2, '0')}</span><span>{source.title || source.url}</span><ExternalLink size={14} /></a>)}{!!remainingSources.length && <details><summary>Show {remainingSources.length} more sources</summary>{remainingSources.map((source, index) => <a href={source.url} target="_blank" rel="noopener noreferrer" key={`${source.url}-${index + 12}`}><span className="source-number">{String(index + 13).padStart(2, '0')}</span><span>{source.title || source.url}</span><ExternalLink size={14} /></a>)}</details>}</section>}
          {!running && !failed && <div className="report-next"><span className="eyebrow">YOUR TURN</span><h3>Every place has<br />an unfinished story.</h3><p>Follow your curiosity. Research a place, a company or an idea with Valyu.</p><button className="primary-button" onClick={onResearch}>Start an investigation <ArrowUpRight size={18} /></button></div>}
          <div className="report-colophon"><span>GLOBAL FAIL MAP / BY VALYU</span>{example && <span>{formatCoordinates(example.lat, example.lng)}</span>}</div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
