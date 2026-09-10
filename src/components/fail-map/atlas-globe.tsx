'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import {
  ArrowUpRight,
  ChevronRight,
  Compass,
  Globe2,
  Minus,
  Palette,
  Plus,
  X,
} from 'lucide-react';
import {
  categories,
  type FailExample,
  type Investigation,
  type Location,
} from './types';
import { MarkerSymbol } from './marker-symbol';
import { createClusterSymbol, createMapSymbol } from './map-symbols';
import { groupMapExamples } from './map-groups';
import {
  isChartedLocation,
  mapGeocodingTypes,
  resolveMapLocation,
} from './map-location';
import {
  getGlobeSpinStep,
  getMapCameraTarget,
  sameMapCameraTarget,
  spinResumeDelay,
  wrapLongitude,
  type MapCameraTarget,
} from './map-camera';

/** The tag the idle drift puts on the camera moves it makes itself. */
const spinEventData = { globeSpin: true };

function isSpinMove(event: unknown): boolean {
  return !!(event as { globeSpin?: boolean }).globeSpin;
}

/** How often the drift re-groups markers that rotation has pushed together. */
const spinRegroupInterval = 2000;

interface AtlasGlobeProps {
  variant?: 'atlas' | 'report';
  paused?: boolean;
  examples: FailExample[];
  investigations: Investigation[];
  selectedId?: string;
  highlightId?: string;
  focus: Location | null;
  onExample: (example: FailExample) => void;
  onInvestigation: (investigation: Investigation) => void;
  onLocation: (location: Location) => void;
  onZoom?: (zoom: number) => void;
  onUnavailable?: () => void;
  keyOpen?: boolean;
  onKey?: () => void;
  activeCategory?: string;
}

export function AtlasGlobe(props: AtlasGlobeProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const appliedCamera = useRef<MapCameraTarget | null>(null);
  const callbacks = useRef(props);
  callbacks.current = props;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [hovered, setHovered] = useState<FailExample | null>(null);
  const [nearby, setNearby] = useState<FailExample[]>([]);
  const nearbyRef = useRef(nearby);
  nearbyRef.current = nearby;
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const [proposal, setProposal] = useState<Location | null>(null);
  const [uncharted, setUncharted] = useState(false);
  const proposalRef = useRef(false);
  proposalRef.current = !!proposal || uncharted;
  const [viewRevision, setViewRevision] = useState(0);
  const nearbyPanel = useRef<HTMLDivElement>(null);
  const nearbyTrigger = useRef<HTMLElement | null>(null);
  /** Timestamp the idle drift may pick up again after a touch. */
  const spinIdleUntil = useRef(0);
  /** True while a drag, a zoom or a flight owns the camera. */
  const cameraBusy = useRef(false);

  /** Puts the globe back to a plain, uncommitted state. */
  function dismissProposal() {
    setProposal(null);
    setUncharted(false);
    setAnchor(null);
  }

  useEffect(() => {
    setNearby([]);
    dismissProposal();
  }, [props.examples]);

  useEffect(() => {
    if (nearby.length) {
      nearbyPanel.current
        ?.querySelector<HTMLButtonElement>('[data-story]')
        ?.focus({ preventScroll: true });
    }
  }, [nearby]);

  useEffect(() => {
    if (!container.current) return;
    const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
    if (!token) {
      setError(
        'Add a Mapbox public token to enable the globe. Showing every story as a list instead.',
      );
      callbacks.current.onUnavailable?.();
      return;
    }
    let disposed = false;
    let geocoding: AbortController | undefined;
    let pendingClick: number | undefined;
    try {
      const camera = getMapCameraTarget(
        callbacks.current.focus,
        callbacks.current.variant,
        container.current.clientWidth,
      );
      const instance = new mapboxgl.Map({
        container: container.current,
        accessToken: token,
        style: 'mapbox://styles/mapbox/satellite-streets-v12',
        projection: 'globe',
        ...camera,
        minZoom: 0,
        maxZoom: 14,
        attributionControl: false,
        renderWorldCopies: false,
      });
      map.current = instance;
      appliedCamera.current = camera;
      /** Holds the idle drift off for a beat after the reader touches it. */
      const holdSpin = () => {
        spinIdleUntil.current = performance.now() + spinResumeDelay;
      };
      /**
       * The drift moves the camera itself, so its own move events are tagged
       * and skipped here: an automatic turn is not a reason to close a card
       * the reader just opened, nor a touch to wait out.
       */
      instance.on('movestart', (event) => {
        if (isSpinMove(event)) return;
        cameraBusy.current = true;
        holdSpin();
        setNearby([]);
        window.clearTimeout(pendingClick);
        setProposal(null);
        setUncharted(false);
        setAnchor(null);
      });
      instance.on('zoom', () => callbacks.current.onZoom?.(instance.getZoom()));
      instance.on('moveend', (event) => {
        if (isSpinMove(event)) return;
        cameraBusy.current = false;
        holdSpin();
        setViewRevision((revision) => revision + 1);
      });
      instance.on('resize', () => setViewRevision((revision) => revision + 1));
      for (const gesture of ['mousedown', 'touchstart', 'wheel'] as const) {
        instance.on(gesture, holdSpin);
      }
      instance.addControl(
        new mapboxgl.AttributionControl({ compact: true }),
        'bottom-right',
      );
      instance.on('load', () => {
        instance.setFog({
          color: '#0b0b0c',
          'high-color': 'rgba(120, 134, 158, 0.14)',
          'space-color': '#000000',
          /*
           * Mapbox draws the star field itself; it only has to be turned up.
           * The stars carry the turning globe - without them the sphere spins
           * against nothing - and fade out as the reader drops towards the
           * ground, where a starlit sky would be nonsense.
           */
          'star-intensity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            0,
            0.55,
            3,
            0.3,
            5,
            0,
          ],
          'horizon-blend': 0.02,
        });
        const layers = instance.getStyle().layers || [];
        for (const layer of layers) {
          if (layer.id.includes('poi') || layer.id.includes('transit')) {
            instance.setLayoutProperty(layer.id, 'visibility', 'none');
          }
          if (layer.type === 'raster') {
            instance.setPaintProperty(layer.id, 'raster-saturation', -0.8);
            instance.setPaintProperty(layer.id, 'raster-brightness-max', 0.8);
          }
        }
        if (!disposed) setReady(true);
        callbacks.current.onZoom?.(instance.getZoom());
      });
      instance.on('error', (event) => {
        if (
          event.error?.message?.includes('401') ||
          event.error?.message?.includes('403')
        ) {
          setError(
            'Map access is unavailable. Showing every story as a list instead.',
          );
          callbacks.current.onUnavailable?.();
        }
      });
      /**
       * A click on the globe asks a question; it no longer opens a form.
       * Mapbox keeps double click bound to zoom, so the resolution waits long
       * enough for a second click to cancel it, and unnamed points such as
       * open water are told they are uncharted rather than offered for
       * research.
       */
      instance.on('dblclick', () => {
        window.clearTimeout(pendingClick);
        geocoding?.abort();
      });
      instance.on('click', (event) => {
        if (callbacks.current.paused) return;
        window.clearTimeout(pendingClick);
        geocoding?.abort();
        if (nearbyRef.current.length) {
          setNearby([]);
          return;
        }
        if (proposalRef.current) {
          dismissProposal();
          return;
        }
        const point = {
          latitude: event.lngLat.lat,
          longitude: event.lngLat.lng,
          zoom: instance.getZoom(),
        };
        pendingClick = window.setTimeout(async () => {
          const request = new AbortController();
          geocoding = request;
          let location = resolveMapLocation(null, point);
          try {
            const response = await fetch(
              `https://api.mapbox.com/geocoding/v5/mapbox.places/${point.longitude},${point.latitude}.json?types=${mapGeocodingTypes}&access_token=${token}`,
              { signal: request.signal },
            );
            if (response.ok) {
              location = resolveMapLocation(await response.json(), point);
            }
          } catch {
            /* An unresolved point is treated as uncharted below. */
          }
          if (disposed || request.signal.aborted) return;
          const at = instance.project([point.longitude, point.latitude]);
          setAnchor({ x: at.x, y: at.y });
          if (isChartedLocation(location)) {
            setUncharted(false);
            setProposal(location);
          } else {
            setProposal(null);
            setUncharted(true);
          }
        }, 280);
      });
    } catch {
      setError(
        'This browser could not start the globe. Showing every story as a list instead.',
      );
      callbacks.current.onUnavailable?.();
    }
    const resize = new ResizeObserver(() => map.current?.resize());
    resize.observe(container.current);
    return () => {
      disposed = true;
      resize.disconnect();
      window.clearTimeout(pendingClick);
      geocoding?.abort();
      try {
        map.current?.remove();
      } catch {}
      map.current = null;
      appliedCamera.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready || !map.current) return;
    const instance = map.current;
    const markers: mapboxgl.Marker[] = [];
    const groups = props.paused
      ? props.examples.map((example) => [example])
      : groupMapExamples(props.examples, (example) =>
          instance.project([example.lng, example.lat]),
        );
    for (const group of groups) {
      const example = group[0];
      const grouped = group.length > 1;
      const button = document.createElement(props.paused ? 'div' : 'button');
      if (!props.paused) button.setAttribute('type', 'button');
      const highlighted =
        !!props.highlightId &&
        group.some((entry) => entry.id === props.highlightId);
      button.className = `atlas-pin${props.selectedId === example.id ? ' is-selected' : ''}${
        highlighted ? ' is-highlighted' : ''
      }${grouped ? ' is-cluster' : ''}`;
      button.dataset.mapCategory = grouped ? 'cluster' : example.category;
      button.setAttribute(
        'aria-label',
        grouped
          ? `${group.length} nearby stories: ${group.map((entry) => entry.title).join(', ')}`
          : `${example.title}, ${example.location}${props.paused ? '' : '. Read the report'}`,
      );
      const dot = document.createElement('span');
      dot.className = 'atlas-pin-dot';
      dot.appendChild(
        grouped
          ? createClusterSymbol()
          : createMapSymbol(example.id, example.category),
      );
      if (grouped) {
        const count = document.createElement('span');
        count.className = 'atlas-pin-count';
        count.textContent = String(group.length);
        dot.appendChild(count);
      }
      button.appendChild(dot);
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        if (callbacks.current.paused) return;
        dismissProposal();
        if (grouped) {
          nearbyTrigger.current = button;
          setHovered(null);
          const at = instance.project([example.lng, example.lat]);
          setAnchor({ x: at.x, y: at.y });
          setNearby(group);
          return;
        }
        setNearby([]);
        callbacks.current.onExample(example);
      });
      if (!props.paused && !grouped) {
        button.addEventListener('mouseenter', () => setHovered(example));
        button.addEventListener('mouseleave', () => setHovered(null));
        button.addEventListener('focus', () => setHovered(example));
        button.addEventListener('blur', () => setHovered(null));
      }
      markers.push(
        new mapboxgl.Marker({ element: button, occludedOpacity: 0.12 })
          .setLngLat([example.lng, example.lat])
          .addTo(instance),
      );
      button.setAttribute('role', props.paused ? 'img' : 'button');
      button.tabIndex = props.paused ? -1 : 0;
    }
    for (const investigation of props.investigations) {
      if (investigation.location.scope === 'worldwide') continue;
      const button = document.createElement(props.paused ? 'div' : 'button');
      if (!props.paused) button.setAttribute('type', 'button');
      button.className = 'atlas-pin';
      button.dataset.mapCategory = 'personal';
      button.setAttribute(
        'aria-label',
        `Your research: ${investigation.location.name}`,
      );
      const dot = document.createElement('span');
      dot.className = 'atlas-pin-dot';
      dot.appendChild(createMapSymbol('', investigation.category));
      button.appendChild(dot);
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        if (callbacks.current.paused) return;
        callbacks.current.onInvestigation(investigation);
      });
      markers.push(
        new mapboxgl.Marker({ element: button, occludedOpacity: 0.12 })
          .setLngLat([
            investigation.location.longitude,
            investigation.location.latitude,
          ])
          .addTo(instance),
      );
      button.setAttribute('role', props.paused ? 'img' : 'button');
      button.tabIndex = props.paused ? -1 : 0;
    }
    return () => {
      setHovered(null);
      markers.forEach((marker) => marker.remove());
    };
  }, [
    props.examples,
    props.investigations,
    props.selectedId,
    props.highlightId,
    props.paused,
    ready,
    viewRevision,
  ]);

  const focusLatitude = props.focus?.latitude;
  const focusLongitude = props.focus?.longitude;
  const focusScope = props.focus?.scope;

  useEffect(() => {
    if (!ready || !map.current) return;
    const camera = getMapCameraTarget(
      callbacks.current.focus,
      props.variant,
      container.current?.clientWidth || 0,
    );
    if (sameMapCameraTarget(appliedCamera.current, camera)) return;
    appliedCamera.current = camera;
    if (props.variant === 'report') {
      map.current.jumpTo(camera);
      return;
    }
    map.current.flyTo({
      ...camera,
      duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 0
        : 1400,
      essential: false,
    });
  }, [focusLatitude, focusLongitude, focusScope, props.variant, ready]);

  /**
   * The globe turns on its own until the reader engages with it: a drag, a
   * zoom, a hover over a marker, or any card opened on top of it stops the
   * drift, and it picks up again from wherever the camera was left a couple
   * of seconds after they let go. A report map holds still - its whole job is
   * to keep one place in frame - and a reader who has asked for less motion
   * never sees it move.
   */
  const spinHeld =
    props.variant === 'report' ||
    !!props.paused ||
    !!hovered ||
    !!nearby.length ||
    !!proposal ||
    uncharted;

  useEffect(() => {
    if (!ready || spinHeld || !map.current) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const instance = map.current;
    let frame = 0;
    let previous = performance.now();
    let regrouped = previous;
    const turn = (now: number) => {
      frame = requestAnimationFrame(turn);
      const elapsed = now - previous;
      previous = now;
      if (cameraBusy.current || now < spinIdleUntil.current) return;
      const degrees = getGlobeSpinStep(instance.getZoom(), elapsed);
      if (!degrees) return;
      const centre = instance.getCenter();
      instance.jumpTo(
        { center: [wrapLongitude(centre.lng - degrees), centre.lat] },
        spinEventData,
      );
      /*
       * Markers cluster by where they land on screen, and rotation keeps
       * changing that, so the grouping is refreshed on a slow beat rather
       * than every frame.
       */
      if (now - regrouped > spinRegroupInterval) {
        regrouped = now;
        setViewRevision((revision) => revision + 1);
      }
    };
    frame = requestAnimationFrame(turn);
    return () => cancelAnimationFrame(frame);
  }, [ready, spinHeld]);

  /**
   * Pins a floating card to the point it belongs to. A card parked in the far
   * corner broke the thread between what the reader touched and what appeared,
   * so both the cluster list and the place question sit at their own marker.
   */
  const anchorStyle = anchor
    ? ({
        position: 'absolute',
        left: `${anchor.x}px`,
        top: `${anchor.y}px`,
        right: 'auto',
        translate: '-50% calc(-100% - 26px)',
      } as const)
    : undefined;

  return (
    <div
      className={`atlas-globe${props.variant === 'report' ? ' report-globe' : ''}`}
    >
      <div
        ref={container}
        className="map-canvas"
        role="region"
        aria-label={
          props.paused
            ? 'Report location map. Drag to explore the surrounding area.'
            : 'Interactive world map. Drag to explore or select a report marker.'
        }
      />
      {!ready && !error && (
        <div className="map-state">
          <Globe2 className="map-loading-icon" />
          <span>Loading map...</span>
        </div>
      )}
      {error && (
        <div className="map-state map-error">
          <Globe2 size={40} />
          <p>{error}</p>
        </div>
      )}
      <div className="map-controls" aria-label="Map controls">
        <button aria-label="Zoom in" onClick={() => map.current?.zoomIn()}>
          <Plus size={18} />
        </button>
        <button aria-label="Zoom out" onClick={() => map.current?.zoomOut()}>
          <Minus size={18} />
        </button>
        <button
          aria-label={
            props.variant === 'report' &&
            props.focus &&
            props.focus.scope !== 'worldwide'
              ? 'Recenter on research area'
              : 'Reset globe view'
          }
          onClick={() =>
            map.current?.flyTo({
              ...getMapCameraTarget(
                props.variant === 'report' ? props.focus : null,
                props.variant,
                container.current?.clientWidth || 0,
              ),
              bearing: 0,
              pitch: 0,
              duration: window.matchMedia('(prefers-reduced-motion: reduce)')
                .matches
                ? 0
                : 1000,
            })
          }
        >
          <Compass size={19} />
        </button>
      </div>
      {props.onKey && (
        <button
          className="map-key-toggle"
          onClick={props.onKey}
          aria-expanded={props.keyOpen}
          aria-label="Marker key and category filter"
          aria-controls="atlas-legend"
          title="Marker key"
          data-active={props.keyOpen}
        >
          <Palette size={18} />
          {!!props.activeCategory && props.activeCategory !== 'all' && (
            <span
              className="map-key-flag"
              data-map-category={props.activeCategory}
            />
          )}
        </button>
      )}
      {!!nearby.length && (
        <div
          className="map-nearby"
          ref={nearbyPanel}
          style={anchorStyle}
          role="region"
          aria-label="Nearby stories"
          onBlur={(event) => {
            if (
              event.relatedTarget &&
              !event.currentTarget.contains(event.relatedTarget)
            ) {
              setNearby([]);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setNearby([]);
              nearbyTrigger.current?.focus({ preventScroll: true });
            }
          }}
        >
          <div className="map-nearby-heading">
            <strong>{nearby.length} nearby stories</strong>
            <button
              aria-label="Close nearby stories"
              onClick={() => {
                setNearby([]);
                nearbyTrigger.current?.focus({ preventScroll: true });
              }}
            >
              <X size={16} />
            </button>
          </div>
          <div className="map-nearby-list">
            {nearby.map((example) => (
              <button
                key={example.id}
                data-story
                onClick={() => {
                  setNearby([]);
                  props.onExample(example);
                }}
              >
                <span
                  className="map-nearby-mark"
                  data-map-category={example.category}
                >
                  <MarkerSymbol id={example.id} category={example.category} />
                </span>
                <span>
                  <strong>{example.title}</strong>
                  <small>{example.location}</small>
                </span>
                <ChevronRight size={14} />
              </button>
            ))}
          </div>
        </div>
      )}
      {(proposal || uncharted) && !nearby.length && (
        <div
          className="map-place"
          style={anchorStyle}
          role="dialog"
          aria-label="Research this place"
          onKeyDown={(event) => {
            if (event.key === 'Escape') dismissProposal();
          }}
        >
          {proposal ? (
            <>
              <p className="map-place-name">{proposal.name}</p>
              <div className="map-place-actions">
                <button
                  className="map-place-go"
                  autoFocus
                  onClick={() => {
                    const location = proposal;
                    dismissProposal();
                    props.onLocation(location);
                  }}
                >
                  Research this place <ArrowUpRight size={14} />
                </button>
                <button
                  className="map-place-dismiss"
                  aria-label="Dismiss"
                  onClick={dismissProposal}
                >
                  <X size={14} />
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="map-place-name is-empty">Nothing charted here</p>
              <div className="map-place-actions">
                <p className="map-place-hint">
                  Pick a marker, or search a place by name.
                </p>
                <button
                  className="map-place-dismiss"
                  aria-label="Dismiss"
                  autoFocus
                  onClick={dismissProposal}
                >
                  <X size={14} />
                </button>
              </div>
            </>
          )}
        </div>
      )}
      {hovered && !nearby.length && !proposal && !uncharted && (
        <div className="map-hover-card">
          <span className="eyebrow">
            {hovered.location} · {hovered.period}
          </span>
          <strong>{hovered.title}</strong>
          <span className="hover-summary">
            {hovered.subtitle || hovered.status}
          </span>
          <span className="hover-category" data-map-category={hovered.category}>
            <MarkerSymbol category={hovered.category} />
            {categories.find((item) => item.id === hovered.category)?.label}
          </span>
        </div>
      )}
    </div>
  );
}
