'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Compass, Globe2, Minus, Plus } from 'lucide-react';
import { type FailExample, type Investigation, type Location } from './types';

interface AtlasGlobeProps {
  variant?: 'atlas' | 'report';
  paused?: boolean;
  examples: FailExample[];
  investigations: Investigation[];
  selectedId?: string;
  focus: Location | null;
  onExample: (example: FailExample) => void;
  onInvestigation: (investigation: Investigation) => void;
  onLocation: (location: Location) => void;
}

export function AtlasGlobe(props: AtlasGlobeProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const callbacks = useRef(props);
  callbacks.current = props;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [hovered, setHovered] = useState<FailExample | null>(null);

  useEffect(() => {
    if (!container.current) return;
    const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
    if (!token) {
      setError(
        'Add a Mapbox public token to enable the globe. Every report is still available in the explorer.',
      );
      return;
    }
    let disposed = false;
    let geocoding: AbortController | undefined;
    try {
      const instance = new mapboxgl.Map({
        container: container.current,
        accessToken: token,
        style: 'mapbox://styles/mapbox/satellite-streets-v12',
        projection: 'globe',
        center: [10, 22],
        zoom: container.current.clientWidth < 640 ? 0.8 : 1.6,
        minZoom: 0,
        maxZoom: 14,
        attributionControl: false,
        renderWorldCopies: false,
      });
      map.current = instance;
      instance.addControl(
        new mapboxgl.AttributionControl({ compact: true }),
        'bottom-right',
      );
      instance.on('load', () => {
        instance.setFog({
          color: '#46433c',
          'high-color': 'rgba(161, 149, 130, 0.12)',
          'space-color': '#22211f',
          'star-intensity': 0,
          'horizon-blend': 0.025,
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
      });
      instance.on('error', (event) => {
        if (
          event.error?.message?.includes('401') ||
          event.error?.message?.includes('403')
        ) {
          setError(
            'Map access is unavailable. You can explore all the reports in the list.',
          );
        }
      });
      instance.on('click', async (event) => {
        if (callbacks.current.paused) return;
        geocoding?.abort();
        const request = new AbortController();
        geocoding = request;
        const latitude = event.lngLat.lat;
        const longitude = event.lngLat.lng;
        let name = `${latitude.toFixed(3)}, ${longitude.toFixed(3)}`;
        try {
          const response = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?types=country,region,place,locality&access_token=${token}`,
            { signal: request.signal },
          );
          if (response.ok) {
            const result = await response.json();
            name = result.features?.[0]?.place_name || name;
          }
        } catch {
          /* Coordinates remain a valid research location. */
        }
        if (!disposed && !request.signal.aborted)
          callbacks.current.onLocation({ name, latitude, longitude });
      });
    } catch {
      setError(
        'This browser could not start the globe. All reports are available in the explorer.',
      );
    }
    const resize = new ResizeObserver(() => map.current?.resize());
    resize.observe(container.current);
    return () => {
      disposed = true;
      resize.disconnect();
      geocoding?.abort();
      try {
        map.current?.remove();
      } catch {}
      map.current = null;
    };
  }, []);

  useEffect(() => {
    if (!ready || !map.current) return;
    const instance = map.current;
    const markers: mapboxgl.Marker[] = [];
    for (const example of props.examples) {
      const button = document.createElement(props.paused ? 'div' : 'button');
      if (!props.paused) button.setAttribute('type', 'button');
      button.className = `atlas-pin${props.selectedId === example.id ? ' is-selected' : ''}`;
      button.setAttribute(
        'aria-label',
        `${example.title}, ${example.location}${props.paused ? '' : '. Read the report'}`,
      );
      const dot = document.createElement('span');
      dot.className = 'atlas-pin-dot';
      button.appendChild(dot);
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        if (callbacks.current.paused) return;
        callbacks.current.onExample(example);
      });
      if (!props.paused) {
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
      button.className = 'atlas-pin personal-pin';
      button.setAttribute(
        'aria-label',
        `Your research: ${investigation.location.name}`,
      );
      const dot = document.createElement('span');
      dot.className = 'atlas-pin-dot';
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
    props.paused,
    ready,
  ]);

  useEffect(() => {
    if (!ready) return;
    const location = props.focus?.scope === 'worldwide' ? null : props.focus;
    map.current?.flyTo({
      center: location ? [location.longitude, location.latitude] : [10, 22],
      zoom: location
        ? props.variant === 'report'
          ? 3.3
          : 2.5
        : (container.current?.clientWidth || 0) < 640
          ? 0.8
          : 1.6,
      duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 0
        : 1400,
      essential: false,
    });
  }, [props.focus, props.variant, ready]);

  return (
    <div
      className={`atlas-globe${props.variant === 'report' ? ' report-globe' : ''}`}
    >
      <div
        ref={container}
        className="map-canvas"
        role="region"
        aria-label="Interactive world map. Drag to explore or select a report marker."
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
          aria-label="Reset globe view"
          onClick={() =>
            map.current?.flyTo({
              center: [10, 22],
              zoom: (container.current?.clientWidth || 0) < 640 ? 0.8 : 1.6,
              bearing: 0,
              pitch: 0,
              duration: 1000,
            })
          }
        >
          <Compass size={19} />
        </button>
      </div>
      {hovered && (
        <div className="map-hover-card">
          <span className="eyebrow">
            {hovered.location} · {hovered.period}
          </span>
          <strong>{hovered.title}</strong>
          <span>{hovered.subtitle || hovered.status}</span>
        </div>
      )}
    </div>
  );
}
