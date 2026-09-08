'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, Check, ChevronRight, Command, Globe2, History, Info, List, Loader2, LogOut, MapPin, Search, Shuffle, X } from 'lucide-react';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useAuthStore } from '@/lib/stores/use-auth-store';
import { ReportPanel } from './report-panel';
import { categories, categoryInfo, type Category, type FailExample, type Investigation, type Location } from './types';

const AtlasGlobe = dynamic(() => import('./atlas-globe').then((module) => module.AtlasGlobe), { ssr: false });
const isSelfHosted = process.env.NEXT_PUBLIC_APP_MODE !== 'valyu';
const draftKey = 'global-fail-map-research-draft';

interface PlaceResult {
  id: string;
  place_name: string;
  center: [number, number];
}

export function FailAtlas({ examples }: { examples: FailExample[] }) {
  const { user, signInWithValyu, signOut, loading: authLoading } = useAuthStore();
  const signedIn = !!user;
  const searchInput = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category>('all');
  const [places, setPlaces] = useState<PlaceResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedExample, setSelectedExample] = useState<FailExample | null>(null);
  const [investigations, setInvestigations] = useState<Investigation[]>([]);
  const [activeInvestigation, setActiveInvestigation] = useState<Investigation | null>(null);
  const [showInvestigation, setShowInvestigation] = useState(false);
  const [focus, setFocus] = useState<Location | null>(null);
  const [pendingLocation, setPendingLocation] = useState<Location | null>(null);
  const [instructions, setInstructions] = useState('');
  const [researchCategory, setResearchCategory] = useState<Category>('all');
  const [submitting, setSubmitting] = useState(false);
  const [composerError, setComposerError] = useState('');
  const [activeTab, setActiveTab] = useState<'atlas' | 'history'>('atlas');
  const [mobileView, setMobileView] = useState<'map' | 'list'>('map');
  const [aboutOpen, setAboutOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [explorerOpen, setExplorerOpen] = useState(false);

  const filteredExamples = useMemo(() => examples.filter((example) =>
    (category === 'all' || example.category === category) &&
    `${example.title} ${example.subtitle} ${example.location} ${example.country} ${example.summary}`.toLowerCase().includes(query.toLowerCase().trim()),
  ), [category, examples, query]);

  const loadInvestigations = useCallback(async () => {
    if (!signedIn && !isSelfHosted) return;
    setHistoryLoading(true);
    try {
      const response = await fetch('/api/investigations');
      if (!response.ok) throw new Error('Your research history could not be loaded.');
      const data = await response.json();
      setInvestigations(data.investigations || []);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not load your research.');
    } finally { setHistoryLoading(false); }
  }, [signedIn]);

  useEffect(() => { void loadInvestigations(); }, [loadInvestigations]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === '/' && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) {
        event.preventDefault();
        searchInput.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(''), 6500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    const handleUrl = () => {
      const params = new URLSearchParams(window.location.search);
      const caseId = params.get('case');
      const example = examples.find((item) => item.id === caseId);
      if (example) {
        setSelectedExample(example);
        setFocus({ name: example.location, latitude: example.lat, longitude: example.lng });
      }
      if (params.has('auth_error')) setNotice(params.get('auth_error') || 'Sign-in did not finish. Please try connecting again.');
    };
    handleUrl();
    window.addEventListener('popstate', handleUrl);
    try {
      const saved = sessionStorage.getItem(draftKey);
      if (saved) {
        const draft = JSON.parse(saved);
        if (draft.location && typeof draft.location.name === 'string' && Number.isFinite(draft.location.latitude) && Number.isFinite(draft.location.longitude)) {
          setPendingLocation(draft.location);
          setInstructions(typeof draft.instructions === 'string' ? draft.instructions : '');
          setResearchCategory(categories.some((item) => item.id === draft.category) ? draft.category : 'all');
        }
        sessionStorage.removeItem(draftKey);
      }
    } catch { /* A fresh draft works when session storage is unavailable. */ }
    return () => window.removeEventListener('popstate', handleUrl);
  }, [examples]);

  useEffect(() => {
    const search = query.trim();
    const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
    if (search.length < 3 || !token) {
      setPlaces([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(search)}.json?types=country,region,place,locality&limit=3&access_token=${token}`, { signal: controller.signal });
        if (response.ok) {
          const data = await response.json();
          setPlaces(data.features || []);
        }
      } catch { /* Curated reports and worldwide research stay available. */ }
      finally { if (!controller.signal.aborted) setSearching(false); }
    }, 350);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [query]);

  const activeInvestigationId = activeInvestigation?.id;
  const activeInvestigationStatus = activeInvestigation?.status;

  useEffect(() => {
    if (!activeInvestigationId || !activeInvestigationStatus || ['completed', 'failed', 'cancelled'].includes(activeInvestigationStatus)) return;
    let disposed = false;
    let timeout: ReturnType<typeof setTimeout>;
    let consecutiveErrors = 0;
    const poll = async () => {
      try {
        const response = await fetch(`/api/investigations/${encodeURIComponent(activeInvestigationId)}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Could not check research progress.');
        if (disposed) return;
        consecutiveErrors = 0;
        setActiveInvestigation(data.investigation);
        setInvestigations((current) => [data.investigation, ...current.filter((item) => item.id !== data.investigation.id)]);
        if (['completed', 'failed', 'cancelled'].includes(data.investigation.status)) {
          if (data.investigation.status === 'completed') setNotice(`Your report on ${data.investigation.location.name} is ready.`);
          return;
        }
      } catch {
        consecutiveErrors += 1;
        if (consecutiveErrors === 3) setNotice('The connection is taking longer than usual. Your research is still saved.');
      }
      if (!disposed) timeout = setTimeout(poll, Math.min(30000, 4500 * (consecutiveErrors + 1)));
    };
    timeout = setTimeout(poll, 1500);
    return () => { disposed = true; clearTimeout(timeout); };
  }, [activeInvestigationId, activeInvestigationStatus]);

  const chooseExample = useCallback((example: FailExample) => {
    setSelectedExample(example);
    setShowInvestigation(false);
    setFocus({ name: example.location, latitude: example.lat, longitude: example.lng });
    setExplorerOpen(false);
    window.history.replaceState({}, '', `/?case=${encodeURIComponent(example.id)}`);
  }, []);

  const chooseInvestigation = useCallback((investigation: Investigation) => {
    setActiveInvestigation(investigation);
    setShowInvestigation(true);
    setSelectedExample(null);
    setFocus(investigation.location);
    setExplorerOpen(false);
    window.history.replaceState({}, '', '/');
    if (investigation.status === 'completed' && !investigation.report) {
      fetch(`/api/investigations/${encodeURIComponent(investigation.id)}`)
        .then(async (response) => {
          const data = await response.json();
          if (!response.ok) throw new Error(data.message || 'Could not open this report.');
          setActiveInvestigation((current) => current?.id === investigation.id ? data.investigation : current);
        })
        .catch((error: Error) => setNotice(error.message));
    }
  }, []);

  const chooseLocation = useCallback((location: Location) => {
    setPendingLocation(location);
    setResearchCategory(category);
    setComposerError('');
    setFocus(location);
    setSelectedExample(null);
    setShowInvestigation(false);
    setExplorerOpen(false);
  }, [category]);

  function closeReport() {
    setSelectedExample(null);
    setShowInvestigation(false);
    window.history.replaceState({}, '', '/');
  }

  function surprise() {
    const pool = filteredExamples.length ? filteredExamples : examples;
    const otherExamples = pool.filter((item) => item.id !== selectedExample?.id);
    const choices = otherExamples.length ? otherExamples : pool;
    if (choices.length) chooseExample(choices[Math.floor(Math.random() * choices.length)]);
  }

  async function connect() {
    setSubmitting(true);
    setComposerError('');
    try {
      if (pendingLocation) sessionStorage.setItem(draftKey, JSON.stringify({ location: pendingLocation, category: researchCategory, instructions }));
      const result = await signInWithValyu();
      if (result.error) throw new Error('Could not connect to Valyu. Please try again.');
    } catch (error) {
      setComposerError(error instanceof Error ? error.message : 'Could not connect to Valyu.');
      setSubmitting(false);
    }
  }

  async function startResearch(event: React.FormEvent) {
    event.preventDefault();
    if (!pendingLocation || submitting) return;
    if (!isSelfHosted && !signedIn) { await connect(); return; }
    setSubmitting(true);
    setComposerError('');
    try {
      const input = { location: pendingLocation, category: researchCategory === 'all' ? 'general' : researchCategory, instructions: instructions.trim() || undefined };
      const response = await fetch('/api/investigations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'The research could not start. Please try again.');
      setActiveInvestigation(data.investigation);
      setInvestigations((current) => [data.investigation, ...current.filter((item) => item.id !== data.investigation.id)]);
      setSelectedExample(null);
      setShowInvestigation(true);
      setPendingLocation(null);
      setInstructions('');
      setActiveTab('history');
      window.history.replaceState({}, '', '/');
    } catch (error) {
      setComposerError(error instanceof Error ? error.message : 'The research could not start.');
    } finally { setSubmitting(false); }
  }

  function researchFromReport() {
    const location = selectedExample
      ? { name: selectedExample.location, latitude: selectedExample.lat, longitude: selectedExample.lng }
      : activeInvestigation?.location;
    closeReport();
    if (location) chooseLocation(location);
    else searchInput.current?.focus();
  }

  async function disconnect() {
    const result = await signOut();
    if (result.error) {
      setNotice('Could not disconnect your account. Please try again.');
      return;
    }
    setInvestigations([]);
    setActiveInvestigation(null);
    setShowInvestigation(false);
    setNotice('Signed out. The atlas is still yours to explore.');
  }

  return (
    <main className={`fail-atlas mobile-${mobileView}`}>
      <a href="#atlas-search" className="skip-link">Skip to search</a>
      <header className="atlas-header">
        <Link className="atlas-brand" href="/" aria-label="Global Fail Map home"><span className="brand-symbol"><Globe2 size={29} /><span /></span><span>GLOBAL<br /><strong>FAIL MAP</strong></span></Link>
        <nav className="header-nav" aria-label="Main navigation">
          <button className="atlas-launch" onClick={() => setExplorerOpen(true)}><List size={15} /> Explore the atlas <span>{examples.length}</span></button>
          {isSelfHosted ? <span className="connection-label"><span className="live-dot" />SELF-HOSTED</span> : signedIn ? <button className="account-button" onClick={disconnect} title="Disconnect Valyu"><Check size={14} /><span>Connected</span><LogOut size={13} /></button> : <button className="account-button" disabled={authLoading || submitting} onClick={connect}><span>{submitting ? 'Connecting...' : 'Connect Valyu'}</span><ArrowUpRight size={14} /></button>}
        </nav>
      </header>

      <div className="atlas-body">
        <aside className={`explorer${explorerOpen ? ' is-open' : ''}`} aria-label="Explore the atlas" aria-hidden={!explorerOpen}>
          <button className="explorer-close icon-button" onClick={() => setExplorerOpen(false)} aria-label="Close atlas explorer"><X size={19} /></button>
          <div className="explorer-intro">
            <div className="eyebrow intro-eyebrow"><span className="tiny-cross">+</span> A FIELD GUIDE TO WHAT DIDN’T WORK</div>
            <h1>Explore the<br /><span>failed futures.</span></h1>
            <p>Twenty ambitious attempts. Read what happened, what survived and what the next builder can take forward.</p>
            <div className="search-shell"><Search size={17} /><input ref={searchInput} id="atlas-search" autoComplete="off" placeholder="Search a place or an idea" aria-label="Search places, ideas and reports" value={query} onChange={(event) => { setQuery(event.target.value); setActiveTab('atlas'); if (event.target.value) setMobileView('list'); }} /><button className="search-shortcut" aria-label={query ? 'Clear search' : 'Focus search'} onClick={() => query ? setQuery('') : searchInput.current?.focus()}>{query ? <X size={15} /> : '/'}</button></div>
          </div>

          <div className="explorer-tabs" role="tablist" aria-label="Report collections"><button role="tab" aria-selected={activeTab === 'atlas'} onClick={() => setActiveTab('atlas')}>The atlas <span>{examples.length}</span></button><button role="tab" aria-selected={activeTab === 'history'} onClick={() => { setActiveTab('history'); void loadInvestigations(); }}><History size={13} />My research {investigations.length > 0 && <span>{investigations.length}</span>}</button></div>

          <div className="explorer-results" role="tabpanel" aria-label={activeTab === 'atlas' ? 'The atlas' : 'My research'}>
            {activeTab === 'atlas' ? <>
              <div className="category-filters" aria-label="Filter reports by category">{categories.map((item) => <button key={item.id} aria-pressed={category === item.id} onClick={() => setCategory(item.id)}>{item.id !== 'all' && <span className="category-dot" style={{ background: item.color }} />}{item.label}</button>)}</div>
              {query.trim().length >= 3 && <div className="place-results"><span className="eyebrow">GO BEYOND THE ATLAS {searching && <Loader2 size={12} className="spin" />}</span>{places.map((place) => <button key={place.id} onClick={() => chooseLocation({ name: place.place_name, latitude: place.center[1], longitude: place.center[0] })}><MapPin size={15} /><span>{place.place_name}</span><ArrowUpRight size={14} /></button>)}<button onClick={() => chooseLocation({ name: query.trim(), latitude: 0, longitude: 0, scope: 'worldwide' })}><Search size={15} /><span>Research “{query.trim()}” worldwide</span><ArrowUpRight size={14} /></button></div>}
              <div className="list-heading"><span className="eyebrow">{query ? 'MATCHING STORIES' : 'START WITH A STORY'}</span><span>{String(filteredExamples.length).padStart(2, '0')}</span></div>
              {filteredExamples.map((example, index) => <button className="case-row" key={example.id} onClick={() => chooseExample(example)} style={{ '--case-color': categoryInfo(example.category).color } as React.CSSProperties}><span className="case-number">{String(index + 1).padStart(2, '0')}</span><span className="case-copy"><span className="case-place">{example.location} <span>·</span> {example.period}</span><strong>{example.title}</strong><span className="case-subtitle">{example.subtitle || example.status}</span></span><ChevronRight size={17} /></button>)}
              {!filteredExamples.length && <div className="empty-state"><Globe2 size={28} /><h3>Uncharted territory.</h3><p>Try a different filter, or start fresh research on a place or idea.</p><button className="text-button" onClick={() => { setCategory('all'); setQuery(''); }}>Show all stories <ArrowRight size={14} /></button></div>}
              <div className="list-endnote"><span className="tiny-cross">+</span> A failed attempt can leave a useful blueprint.</div>
            </> : <>
              <div className="list-heading"><span className="eyebrow">YOUR FIELD NOTES</span>{historyLoading && <Loader2 size={13} className="spin" />}</div>
              {!signedIn && !isSelfHosted ? <div className="empty-state"><History size={28} /><h3>Follow your own questions.</h3><p>Connect your Valyu account to research any place and keep your reports here.</p><button className="secondary-button" onClick={connect}>Connect Valyu <ArrowUpRight size={15} /></button></div> : !investigations.length && !historyLoading ? <div className="empty-state"><MapPin size={28} /><h3>Your first pin is waiting.</h3><p>Click anywhere on the globe or search a place to start an investigation.</p><button className="text-button" onClick={() => { setMobileView('map'); searchInput.current?.focus(); }}>Find a place <ArrowRight size={14} /></button></div> : investigations.map((investigation, index) => <button className="case-row" key={investigation.id} onClick={() => chooseInvestigation(investigation)}><span className="case-number">{String(index + 1).padStart(2, '0')}</span><span className="case-copy"><span className="case-place">{new Date(investigation.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · {investigation.status}</span><strong>{investigation.location.name}</strong><span className="case-subtitle">{categoryInfo(investigation.category).label}</span></span><ChevronRight size={17} /></button>)}
            </>}
          </div>
          <button className="surprise-button" onClick={surprise}><Shuffle size={17} /><span>Take me somewhere unexpected</span><ArrowUpRight size={17} /></button>
        </aside>

        <section className="map-stage" aria-label="Explore the world">
          <AtlasGlobe examples={filteredExamples} investigations={investigations} selectedId={selectedExample?.id} focus={focus} onExample={chooseExample} onInvestigation={chooseInvestigation} onLocation={chooseLocation} />
          <div className="map-hero">
            <span>A FIELD GUIDE TO WHAT DIDN&apos;T WORK</span>
            <h1>Global Fail Map</h1>
            <p>The world is built on attempts.</p>
          </div>
          <div className="map-bottom-note"><span className="map-note-symbol">↗</span><span>Click a signal to read the evidence.<br /><strong>Click anywhere to research what failed there.</strong></span><button onClick={() => setAboutOpen(true)} className="icon-button" aria-label="About the atlas"><Info size={17} /></button></div>
          <button className="map-random" onClick={surprise}><Shuffle size={16} /> Take me somewhere unexpected</button>
        </section>
      </div>

      <nav className="mobile-view-switch" aria-label="Atlas view"><button aria-pressed={mobileView === 'map'} onClick={() => { setMobileView('map'); setExplorerOpen(false); }}><Globe2 size={18} />Globe</button><button aria-pressed={mobileView === 'list'} onClick={() => { setMobileView('list'); setExplorerOpen(true); }}><List size={18} />Explore {examples.length} stories</button></nav>
      <footer className="atlas-footer"><button onClick={() => setAboutOpen(true)}>THE IDEA</button><span><span className="live-dot" />THE FUTURE IS STILL UNDER CONSTRUCTION.</span><a href="https://valyu.ai?utm_source=global-fail-map&utm_medium=app&utm_campaign=atlas" target="_blank" rel="noopener noreferrer">Research by <strong>valyu</strong><ArrowUpRight size={12} /></a><a href="https://github.com/yorkeccak/global-fail-map" target="_blank" rel="noopener noreferrer">SOURCE <Command size={12} /></a></footer>
      {notice && <div className="atlas-toast" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Dismiss notification"><X size={16} /></button></div>}

      <ReportPanel example={selectedExample} investigation={showInvestigation ? activeInvestigation : null} onClose={closeReport} onResearch={researchFromReport} onRetry={researchFromReport} />

      <Dialog open={!!pendingLocation} onOpenChange={(open) => { if (!open && !submitting) setPendingLocation(null); }}>
        <DialogContent className="research-dialog" showCloseButton={false}>
          <div className="dialog-topline"><span className="eyebrow"><span className="tiny-cross">+</span> A NEW INVESTIGATION</span><DialogClose className="icon-button" aria-label="Close research setup" disabled={submitting}><X size={20} /></DialogClose></div>
          <DialogTitle>What happened here?</DialogTitle><DialogDescription>Follow the money, the promises and the evidence.</DialogDescription>
          <form onSubmit={startResearch}>
            <div className="research-destination"><MapPin size={20} /><strong>{pendingLocation?.name}</strong></div>
            <label className="field-label" htmlFor="research-category">FOLLOW A THREAD</label><select id="research-category" value={researchCategory} onChange={(event) => setResearchCategory(event.target.value as Category)}>{categories.map((item) => <option key={item.id} value={item.id}>{item.id === 'all' ? 'Anything that did not go to plan' : item.label}</option>)}</select>
            <label className="field-label" htmlFor="research-instructions">ANYTHING IN PARTICULAR? <span>OPTIONAL</span></label><textarea id="research-instructions" value={instructions} maxLength={2000} onChange={(event) => setInstructions(event.target.value)} placeholder="A company, a time period, a bold promise. What are you curious about?" rows={3} />
            <div className="research-explainer"><span className="eyebrow">REAL SOURCES. A FRESH REPORT.</span><p>Valyu searches the web and research records, then writes a cited report. New investigations use fast research. Atlas examples are already researched and free to read.</p><p>{isSelfHosted ? 'This research uses the Valyu API key configured on your server.' : signedIn ? 'Starting an investigation uses your Valyu account credits.' : 'Connect your Valyu account to continue. You will review this investigation again before any credits are used.'}</p></div>
            {composerError && <p className="inline-error" role="alert">{composerError}</p>}
            <button type="submit" className="primary-button" disabled={submitting || authLoading}>{submitting ? <Loader2 size={17} className="spin" /> : <ArrowUpRight size={17} />}{submitting ? 'One moment...' : !isSelfHosted && !signedIn ? 'Connect with Valyu' : 'Start research'}</button>
            <a className="research-pricing" href="https://platform.valyu.ai" target="_blank" rel="noopener noreferrer">Your Valyu account & credits <ArrowUpRight size={12} /></a>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={aboutOpen} onOpenChange={setAboutOpen}><DialogContent className="about-dialog"><span className="eyebrow">THE IDEA BEHIND THE ATLAS</span><DialogTitle>The world is built<br />on attempts.</DialogTitle><DialogDescription>Some made it. Some changed direction. Some left us a very expensive lesson.</DialogDescription><p>This is a map of the companies, projects and experiments that did not become the future their builders imagined. Each story follows the evidence: what was attempted, what happened and what came next.</p><p>“Failure” is a starting question. A cancelled trial is not proof that a medicine cannot work. A closed company is not proof its people had nothing to offer. The reports distinguish what the sources establish from what remains uncertain.</p><div className="about-punchline">Study the attempts.<br />Keep the ambition.<br /><span>Build the next thing.</span></div><div className="about-links"><a className="primary-button" href="https://valyu.ai?utm_source=global-fail-map&utm_medium=app&utm_campaign=about" target="_blank" rel="noopener noreferrer">Build with Valyu <ArrowUpRight size={16} /></a><a className="secondary-button" href="https://github.com/yorkeccak/global-fail-map" target="_blank" rel="noopener noreferrer">Run it yourself <Command size={16} /></a></div></DialogContent></Dialog>
    </main>
  );
}
