'use client';

import dynamic from 'next/dynamic';
import Image from 'next/image';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  Globe2,
  Github,
  Loader2,
  MapPin,
  Search,
  Shuffle,
  X,
} from 'lucide-react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuthStore } from '@/lib/stores/use-auth-store';
import { ReportPanel } from './report-panel';
import { AtlasDock } from './atlas-dock';
import {
  categories,
  type Category,
  type FailExample,
  type Investigation,
  type Location,
} from './types';

const AtlasGlobe = dynamic(
  () => import('./atlas-globe').then((module) => module.AtlasGlobe),
  { ssr: false },
);
const isSelfHosted = process.env.NEXT_PUBLIC_APP_MODE !== 'valyu';
const draftKey = 'global-fail-map-research-draft';

interface PlaceResult {
  id: string;
  place_name: string;
  center: [number, number];
}

export function FailAtlas({ examples }: { examples: FailExample[] }) {
  const {
    user,
    signInWithValyu,
    signOut,
    loading: authLoading,
  } = useAuthStore();
  const signedIn = !!user;
  const searchInput = useRef<HTMLInputElement>(null);
  const focusSearchOnOpen = useRef(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category>('all');
  const [places, setPlaces] = useState<PlaceResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedExample, setSelectedExample] = useState<FailExample | null>(
    null,
  );
  const [investigations, setInvestigations] = useState<Investigation[]>([]);
  const [activeInvestigation, setActiveInvestigation] =
    useState<Investigation | null>(null);
  const [showInvestigation, setShowInvestigation] = useState(false);
  const [focus, setFocus] = useState<Location | null>(null);
  const [pendingLocation, setPendingLocation] = useState<Location | null>(null);
  const [instructions, setInstructions] = useState('');
  const [researchCategory, setResearchCategory] = useState<Category>('all');
  const [submitting, setSubmitting] = useState(false);
  const [composerError, setComposerError] = useState('');
  const [activeTab, setActiveTab] = useState<'atlas' | 'history'>('atlas');
  const [aboutOpen, setAboutOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [explorerOpen, setExplorerOpen] = useState(false);
  const reportOpen =
    !!selectedExample || (showInvestigation && !!activeInvestigation);

  const openSearch = useCallback(() => {
    focusSearchOnOpen.current = true;
    setExplorerOpen(true);
    setActiveTab('atlas');
    requestAnimationFrame(() =>
      searchInput.current?.focus({ preventScroll: true }),
    );
  }, []);

  const filteredExamples = useMemo(
    () =>
      examples.filter(
        (example) =>
          (category === 'all' || example.category === category) &&
          `${example.title} ${example.subtitle} ${example.location} ${example.country} ${example.summary}`
            .toLowerCase()
            .includes(query.toLowerCase().trim()),
      ),
    [category, examples, query],
  );

  const loadInvestigations = useCallback(async () => {
    if (!signedIn && !isSelfHosted) return;
    setHistoryLoading(true);
    try {
      const response = await fetch('/api/investigations');
      if (!response.ok)
        throw new Error('Your research history could not be loaded.');
      const data = await response.json();
      setInvestigations(data.investigations || []);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'Could not load your research.',
      );
    } finally {
      setHistoryLoading(false);
    }
  }, [signedIn]);

  useEffect(() => {
    void loadInvestigations();
  }, [loadInvestigations]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (
        event.key === '/' &&
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLTextAreaElement) &&
        !(
          event.target instanceof Element &&
          event.target.closest('[role="dialog"]')
        )
      ) {
        event.preventDefault();
        openSearch();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [openSearch]);

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
        setFocus({
          name: example.location,
          latitude: example.lat,
          longitude: example.lng,
        });
      } else {
        setSelectedExample(null);
      }
      if (params.has('auth_error'))
        setNotice(
          params.get('auth_error') ||
            'Sign-in did not finish. Please try connecting again.',
        );
    };
    handleUrl();
    window.addEventListener('popstate', handleUrl);
    try {
      const saved = sessionStorage.getItem(draftKey);
      if (saved) {
        const draft = JSON.parse(saved);
        if (
          draft.location &&
          typeof draft.location.name === 'string' &&
          Number.isFinite(draft.location.latitude) &&
          Number.isFinite(draft.location.longitude)
        ) {
          setPendingLocation(draft.location);
          setInstructions(
            typeof draft.instructions === 'string' ? draft.instructions : '',
          );
          setResearchCategory(
            categories.some((item) => item.id === draft.category)
              ? draft.category
              : 'all',
          );
        }
        sessionStorage.removeItem(draftKey);
      }
    } catch {
      /* A fresh draft works when session storage is unavailable. */
    }
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
    setPlaces([]);
    const timeout = window.setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(search)}.json?types=country,region,place,locality&limit=3&access_token=${token}`,
          { signal: controller.signal },
        );
        if (response.ok) {
          const data = await response.json();
          if (!controller.signal.aborted) setPlaces(data.features || []);
        }
      } catch {
        /* Curated reports and worldwide research stay available. */
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 350);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query]);

  const activeInvestigationId = activeInvestigation?.id;
  const activeInvestigationStatus = activeInvestigation?.status;

  useEffect(() => {
    if (
      !activeInvestigationId ||
      !activeInvestigationStatus ||
      ['completed', 'failed', 'cancelled'].includes(activeInvestigationStatus)
    )
      return;
    let disposed = false;
    let timeout: ReturnType<typeof setTimeout>;
    let consecutiveErrors = 0;
    const poll = async () => {
      try {
        const response = await fetch(
          `/api/investigations/${encodeURIComponent(activeInvestigationId)}`,
        );
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.message || 'Could not check research progress.');
        if (disposed) return;
        consecutiveErrors = 0;
        setActiveInvestigation(data.investigation);
        setInvestigations((current) => [
          data.investigation,
          ...current.filter((item) => item.id !== data.investigation.id),
        ]);
        if (
          ['completed', 'failed', 'cancelled'].includes(
            data.investigation.status,
          )
        ) {
          if (data.investigation.status === 'completed')
            setNotice(
              `Your report on ${data.investigation.location.name} is ready.`,
            );
          return;
        }
      } catch {
        consecutiveErrors += 1;
        if (consecutiveErrors === 3)
          setNotice(
            'The connection is taking longer than usual. Your research is still saved.',
          );
      }
      if (!disposed)
        timeout = setTimeout(
          poll,
          Math.min(30000, 4500 * (consecutiveErrors + 1)),
        );
    };
    timeout = setTimeout(poll, 1500);
    return () => {
      disposed = true;
      clearTimeout(timeout);
    };
  }, [activeInvestigationId, activeInvestigationStatus]);

  const chooseExample = useCallback((example: FailExample) => {
    setSelectedExample(example);
    setShowInvestigation(false);
    setFocus({
      name: example.location,
      latitude: example.lat,
      longitude: example.lng,
    });
    setExplorerOpen(false);
    window.history.replaceState(
      {},
      '',
      `/?case=${encodeURIComponent(example.id)}`,
    );
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
          if (!response.ok)
            throw new Error(data.message || 'Could not open this report.');
          setActiveInvestigation((current) =>
            current?.id === investigation.id ? data.investigation : current,
          );
        })
        .catch((error: Error) => setNotice(error.message));
    }
  }, []);

  const chooseLocation = useCallback(
    (location: Location) => {
      setPendingLocation(location);
      setResearchCategory(category);
      setComposerError('');
      setFocus(location);
      setSelectedExample(null);
      setShowInvestigation(false);
      setExplorerOpen(false);
    },
    [category],
  );

  function closeReport() {
    setSelectedExample(null);
    setShowInvestigation(false);
    setFocus(null);
    window.history.replaceState({}, '', '/');
  }

  function surprise() {
    const pool = filteredExamples.length ? filteredExamples : examples;
    const otherExamples = pool.filter(
      (item) => item.id !== selectedExample?.id,
    );
    const choices = otherExamples.length ? otherExamples : pool;
    if (choices.length)
      chooseExample(choices[Math.floor(Math.random() * choices.length)]);
  }

  async function connect() {
    setSubmitting(true);
    setComposerError('');
    try {
      if (pendingLocation)
        sessionStorage.setItem(
          draftKey,
          JSON.stringify({
            location: pendingLocation,
            category: researchCategory,
            instructions,
          }),
        );
      const result = await signInWithValyu();
      if (result.error)
        throw new Error('Could not connect to Valyu. Please try again.');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Could not connect to Valyu.';
      setComposerError(message);
      if (!pendingLocation) setNotice(message);
      setSubmitting(false);
    }
  }

  async function startResearch(event: React.FormEvent) {
    event.preventDefault();
    if (!pendingLocation || submitting) return;
    if (!isSelfHosted && !signedIn) {
      await connect();
      return;
    }
    setSubmitting(true);
    setComposerError('');
    try {
      const input = {
        location: pendingLocation,
        category: researchCategory === 'all' ? 'general' : researchCategory,
        instructions: instructions.trim() || undefined,
      };
      const response = await fetch('/api/investigations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.message || 'The research could not start. Please try again.',
        );
      setActiveInvestigation(data.investigation);
      setInvestigations((current) => [
        data.investigation,
        ...current.filter((item) => item.id !== data.investigation.id),
      ]);
      setSelectedExample(null);
      setShowInvestigation(true);
      setPendingLocation(null);
      setInstructions('');
      setActiveTab('history');
      window.history.replaceState({}, '', '/');
    } catch (error) {
      setComposerError(
        error instanceof Error
          ? error.message
          : 'The research could not start.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  function researchFromReport() {
    const location = selectedExample
      ? {
          name: selectedExample.location,
          latitude: selectedExample.lat,
          longitude: selectedExample.lng,
        }
      : activeInvestigation?.location;
    closeReport();
    if (location) chooseLocation(location);
    else {
      setExplorerOpen(true);
      setActiveTab('atlas');
    }
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
    <main className="fail-atlas">
      <a href="#atlas-search-trigger" className="skip-link">
        Skip to search
      </a>
      <AtlasGlobe
        examples={filteredExamples}
        investigations={investigations}
        paused={reportOpen}
        focus={focus}
        onExample={chooseExample}
        onInvestigation={chooseInvestigation}
        onLocation={chooseLocation}
      />

      <header className="atlas-heading">
        <h1>Global Fail Map</h1>
        <p>
          A graveyard of failed companies, cancelled projects and abandoned
          ideas.
        </p>
      </header>
      <button className="random-story" onClick={surprise}>
        <Shuffle size={16} />
        <span>Random story</span>
      </button>
      <AtlasDock
        onHome={() => {
          closeReport();
          setExplorerOpen(false);
          setQuery('');
          setCategory('all');
          setFocus(null);
        }}
        onSearch={openSearch}
        onStories={() => {
          focusSearchOnOpen.current = false;
          setExplorerOpen(true);
          setActiveTab('atlas');
          setQuery('');
        }}
        onHistory={() => {
          focusSearchOnOpen.current = false;
          setExplorerOpen(true);
          setActiveTab('history');
          void loadInvestigations();
        }}
        onAbout={() => setAboutOpen(true)}
        onConnect={connect}
        onDisconnect={disconnect}
        signedIn={signedIn}
        selfHosted={isSelfHosted}
        connecting={submitting || authLoading}
      />

      <div className="atlas-discovery">
        <button
          id="atlas-search-trigger"
          className="search-trigger"
          onClick={openSearch}
        >
          <Search size={18} />
          <span>Search a place or an idea</span>
          <kbd>/</kbd>
        </button>
      </div>
      <footer className="atlas-footer">
        <a
          className="atlas-valyu"
          href="https://valyu.ai?utm_source=global-fail-map&utm_medium=app"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Research by Valyu"
        >
          <span>Research by</span>
          <Image src="/valyu.svg" width={51} height={17} alt="Valyu" />
        </a>
        <a
          className="atlas-github"
          href="https://github.com/yorkeccak/global-fail-map"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="View source on GitHub"
          title="View source on GitHub"
        >
          <Github size={16} aria-hidden="true" />
        </a>
      </footer>
      {notice && (
        <div className="atlas-toast" role="status">
          {notice}
          <button
            onClick={() => setNotice('')}
            aria-label="Dismiss notification"
          >
            <X size={16} />
          </button>
        </div>
      )}

      <Dialog open={explorerOpen} onOpenChange={setExplorerOpen} modal={false}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Content
            className="explorer"
            data-slot="explorer-content"
            onInteractOutside={(event) => {
              if (
                event.target instanceof Element &&
                event.target.closest('.atlas-dock, #atlas-search-trigger')
              ) {
                event.preventDefault();
              }
            }}
            onOpenAutoFocus={(event) => {
              if (activeTab === 'atlas' && focusSearchOnOpen.current) {
                event.preventDefault();
                searchInput.current?.focus({ preventScroll: true });
              }
            }}
          >
            <div className="explorer-topline">
              <DialogTitle>
                {activeTab === 'atlas' ? 'Explore' : 'My research'}
              </DialogTitle>
              <DialogClose className="icon-button" aria-label="Close explorer">
                <X size={18} />
              </DialogClose>
            </div>
            <DialogDescription className="sr-only">
              Find a story or research a place or idea.
            </DialogDescription>
            {activeTab === 'atlas' && (
              <div className="explorer-search">
                <Search size={16} />
                <input
                  ref={searchInput}
                  id="atlas-search"
                  autoComplete="off"
                  placeholder="Search a place or idea"
                  aria-label="Search places, ideas and reports"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                {query && (
                  <button
                    onClick={() => setQuery('')}
                    aria-label="Clear search"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            )}
            <div className="explorer-tabs" aria-label="Report collections">
              <button
                aria-pressed={activeTab === 'atlas'}
                onClick={() => setActiveTab('atlas')}
              >
                Stories <span>{examples.length}</span>
              </button>
              <button
                aria-pressed={activeTab === 'history'}
                onClick={() => {
                  setActiveTab('history');
                  void loadInvestigations();
                }}
              >
                My research
              </button>
            </div>
            <div className="explorer-results">
              {activeTab === 'atlas' ? (
                <>
                  {query.trim().length >= 3 && (
                    <div className="place-results">
                      <span className="section-label">
                        Research{' '}
                        {searching && <Loader2 size={12} className="spin" />}
                      </span>
                      {places.map((place) => (
                        <button
                          key={place.id}
                          onClick={() =>
                            chooseLocation({
                              name: place.place_name,
                              latitude: place.center[1],
                              longitude: place.center[0],
                            })
                          }
                        >
                          <MapPin size={15} />
                          <span>{place.place_name}</span>
                          <ArrowUpRight size={14} />
                        </button>
                      ))}
                      <button
                        onClick={() =>
                          chooseLocation({
                            name: query.trim(),
                            latitude: 0,
                            longitude: 0,
                            scope: 'worldwide',
                          })
                        }
                      >
                        <Globe2 size={15} />
                        <span>“{query.trim()}” worldwide</span>
                        <ArrowUpRight size={14} />
                      </button>
                    </div>
                  )}
                  <div className="collection-filter">
                    <span>{query ? 'Matching stories' : 'Stories'}</span>
                    <select
                      aria-label="Filter stories by category"
                      value={category}
                      onChange={(event) =>
                        setCategory(event.target.value as Category)
                      }
                    >
                      {categories.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {filteredExamples.map((example) => (
                    <button
                      className="case-row"
                      key={example.id}
                      onClick={() => chooseExample(example)}
                    >
                      <MapPin size={16} />
                      <span>
                        <strong>{example.title}</strong>
                        <small>
                          {example.location} · {example.country}
                        </small>
                      </span>
                      <ChevronRight size={15} />
                    </button>
                  ))}
                  {!filteredExamples.length && (
                    <div className="empty-state">
                      <p>No matching stories.</p>
                      <button
                        className="text-button"
                        onClick={() => {
                          setCategory('all');
                          setQuery('');
                        }}
                      >
                        Show all stories <ArrowRight size={14} />
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {historyLoading && (
                    <div className="empty-state" role="status">
                      <Loader2 size={19} className="spin" />
                      <p>Loading your research...</p>
                    </div>
                  )}
                  {!signedIn && !isSelfHosted ? (
                    <div className="empty-state">
                      <p>
                        Connect Valyu to research any place and save your
                        reports.
                      </p>
                      <button className="secondary-button" onClick={connect}>
                        Connect Valyu <ArrowUpRight size={15} />
                      </button>
                    </div>
                  ) : !investigations.length && !historyLoading ? (
                    <div className="empty-state">
                      <p>
                        No research yet. Search a place or click the globe to
                        begin.
                      </p>
                    </div>
                  ) : (
                    investigations.map((investigation) => (
                      <button
                        className="case-row"
                        key={investigation.id}
                        onClick={() => chooseInvestigation(investigation)}
                      >
                        <MapPin size={16} />
                        <span>
                          <strong>{investigation.location.name}</strong>
                          <small>
                            {new Date(
                              investigation.createdAt,
                            ).toLocaleDateString('en-GB', {
                              day: 'numeric',
                              month: 'short',
                            })}{' '}
                            · {investigation.status}
                          </small>
                        </span>
                        <ChevronRight size={15} />
                      </button>
                    ))
                  )}
                </>
              )}
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </Dialog>

      <ReportPanel
        example={selectedExample}
        investigation={showInvestigation ? activeInvestigation : null}
        onClose={closeReport}
        onResearch={researchFromReport}
        onRetry={researchFromReport}
        map={
          reportOpen ? (
            <AtlasGlobe
              variant="report"
              paused
              examples={selectedExample ? [selectedExample] : []}
              investigations={
                showInvestigation && activeInvestigation
                  ? [activeInvestigation]
                  : []
              }
              selectedId={selectedExample?.id}
              focus={focus}
              onExample={chooseExample}
              onInvestigation={chooseInvestigation}
              onLocation={chooseLocation}
            />
          ) : undefined
        }
      />

      <Dialog
        open={!!pendingLocation}
        onOpenChange={(open) => {
          if (!open && !submitting) setPendingLocation(null);
        }}
      >
        <DialogContent className="research-dialog" showCloseButton={false}>
          <div className="dialog-topline">
            <DialogTitle>New research</DialogTitle>
            <DialogClose
              className="icon-button"
              aria-label="Close research setup"
              disabled={submitting}
            >
              <X size={18} />
            </DialogClose>
          </div>
          <DialogDescription>
            Discover what was attempted and why it ended, with sources.
          </DialogDescription>
          <form onSubmit={startResearch}>
            <div className="research-destination">
              <MapPin size={20} />
              <strong>{pendingLocation?.name}</strong>
            </div>
            <label className="field-label" htmlFor="research-category">
              Category
            </label>
            <select
              id="research-category"
              value={researchCategory}
              onChange={(event) =>
                setResearchCategory(event.target.value as Category)
              }
            >
              {categories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
            <label className="field-label" htmlFor="research-instructions">
              Focus <span>Optional</span>
            </label>
            <textarea
              id="research-instructions"
              value={instructions}
              maxLength={2000}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder="A company, topic or time period..."
              rows={3}
            />
            <div className="research-explainer">
              <p>
                {isSelfHosted
                  ? 'Uses your configured Valyu API key.'
                  : signedIn
                    ? 'Uses your Valyu account credits.'
                    : 'Connect Valyu to continue. No credits are used until you start the research.'}
              </p>
            </div>
            {composerError && (
              <p className="inline-error" role="alert">
                {composerError}
              </p>
            )}
            <button
              type="submit"
              className="primary-button"
              disabled={submitting || authLoading}
            >
              {submitting ? (
                <Loader2 size={17} className="spin" />
              ) : (
                <ArrowUpRight size={17} />
              )}
              {submitting
                ? 'One moment...'
                : !isSelfHosted && !signedIn
                  ? 'Connect with Valyu'
                  : 'Start research'}
            </button>
            <a
              className="research-pricing"
              href="https://platform.valyu.ai"
              target="_blank"
              rel="noopener noreferrer"
            >
              Your Valyu account & credits <ArrowUpRight size={12} />
            </a>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={aboutOpen} onOpenChange={setAboutOpen}>
        <DialogContent className="about-dialog">
          <DialogTitle>Global Fail Map</DialogTitle>
          <DialogDescription>
            A map of what the world tried and left behind.
          </DialogDescription>
          <p>
            Choose a pin to read one of {examples.length} researched stories, or
            search any place or idea for a new report.
          </p>
          <p>
            Every report follows cited evidence. Cancelled, withdrawn and
            discontinued mean different things. A terminated trial, for example,
            is not automatically a scientific failure.
          </p>
          <div className="about-links">
            <a
              className="primary-button"
              href="https://valyu.ai"
              target="_blank"
              rel="noopener noreferrer"
            >
              Valyu <ArrowUpRight size={16} />
            </a>
            <a
              className="secondary-button"
              href="https://github.com/yorkeccak/global-fail-map"
              target="_blank"
              rel="noopener noreferrer"
            >
              Source code <ArrowUpRight size={16} />
            </a>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
