'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Compass, Globe2, Minus, Plus } from 'lucide-react';
import { categoryInfo, formatCoordinates, type FailExample, type Investigation, type Location } from './types';

interface AtlasGlobeProps {
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
  const [coordinates, setCoordinates] = useState(formatCoordinates(22, 10));
  const [hovered, setHovered] = useState<FailExample | null>(null);

  useEffect(() => {
    if (!container.current) return;
    const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
    if (!token) {
      setError('Add a Mapbox public token to enable the globe. Every report is still available in the explorer.');
      return;
    }
    let disposed = false;
    let resumeTimer: ReturnType<typeof setTimeout>;
    let animationFrame = 0;
    try {
      const instance = new mapboxgl.Map({
        container: container.current,
        accessToken: token,
        style: 'mapbox://styles/mapbox/satellite-streets-v12',
        projection: 'globe',
        center: [10, 22],
        zoom: 1.25,
        minZoom: 0.7,
        maxZoom: 14,
        attributionControl: false,
        renderWorldCopies: false,
      });
      map.current = instance;
      instance.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right');
      instance.on('load', () => {
        instance.setFog({ 'space-color': '#111015', 'star-intensity': 0.18, 'horizon-blend': 0.08 });
        const layers = instance.getStyle().layers || [];
        for (const layer of layers) {
          if (layer.id.includes('poi') || layer.id.includes('transit')) {
            instance.setLayoutProperty(layer.id, 'visibility', 'none');
          }
        }
        if (!disposed) setReady(true);
      });
      instance.on('moveend', () => {
        const center = instance.getCenter();
        setCoordinates(formatCoordinates(center.lat, center.lng));
      });
      let rotating = true;
      let lastFrame = performance.now();
      const pauseRotation = () => {
        rotating = false;
        clearTimeout(resumeTimer);
        resumeTimer = setTimeout(() => { rotating = true; }, 3500);
      };
      for (const eventName of ['mousedown', 'touchstart', 'dragstart', 'zoomstart'] as const) instance.on(eventName, pauseRotation);
      const rotate = (now: number) => {
        if (!disposed && rotating && instance.loaded() && instance.getZoom() < 3.5) {
          const elapsed = Math.min(50, now - lastFrame);
          const center = instance.getCenter();
          center.lng -= elapsed * 0.00075;
          instance.jumpTo({ center });
        }
        lastFrame = now;
        if (!disposed) animationFrame = requestAnimationFrame(rotate);
      };
      animationFrame = requestAnimationFrame(rotate);
      instance.on('error', (event) => {
        if (event.error?.message?.includes('401') || event.error?.message?.includes('403')) {
          setError('Map access is unavailable. You can explore all the reports in the list.');
        }
      });
      instance.on('click', async (event) => {
        const latitude = event.lngLat.lat;
        const longitude = event.lngLat.lng;
        let name = `${latitude.toFixed(3)}, ${longitude.toFixed(3)}`;
        try {
          const response = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?types=country,region,place,locality&access_token=${token}`);
          if (response.ok) {
            const result = await response.json();
            name = result.features?.[0]?.place_name || name;
          }
        } catch { /* Coordinates remain a valid research location. */ }
        if (!disposed) callbacks.current.onLocation({ name, latitude, longitude });
      });
    } catch {
      setError('This browser could not start the globe. All reports are available in the explorer.');
    }
    const resize = new ResizeObserver(() => map.current?.resize());
    resize.observe(container.current);
    return () => {
      disposed = true;
      resize.disconnect();
      cancelAnimationFrame(animationFrame);
      clearTimeout(resumeTimer);
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
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `atlas-pin${props.selectedId === example.id ? ' is-selected' : ''}`;
      button.style.setProperty('--pin-color', categoryInfo(example.category).color);
      button.setAttribute('aria-label', `${example.title}, ${example.location}. Read the report`);
      const dot = document.createElement('span');
      dot.className = 'atlas-pin-dot';
      button.appendChild(dot);
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        callbacks.current.onExample(example);
      });
      button.addEventListener('mouseenter', () => setHovered(example));
      button.addEventListener('mouseleave', () => setHovered(null));
      button.addEventListener('focus', () => setHovered(example));
      button.addEventListener('blur', () => setHovered(null));
      markers.push(new mapboxgl.Marker({ element: button, occludedOpacity: 0.12 }).setLngLat([example.lng, example.lat]).addTo(instance));
    }
    for (const investigation of props.investigations) {
      if (investigation.location.scope === 'worldwide') continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'atlas-pin personal-pin';
      button.style.setProperty('--pin-color', '#e7ebe0');
      button.setAttribute('aria-label', `Your research: ${investigation.location.name}`);
      const dot = document.createElement('span');
      dot.className = 'atlas-pin-dot';
      button.appendChild(dot);
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        callbacks.current.onInvestigation(investigation);
      });
      markers.push(new mapboxgl.Marker({ element: button, occludedOpacity: 0.12 }).setLngLat([investigation.location.longitude, investigation.location.latitude]).addTo(instance));
    }
    return () => {
      setHovered(null);
      markers.forEach((marker) => marker.remove());
    };
  }, [props.examples, props.investigations, props.selectedId, ready]);

  useEffect(() => {
    if (!ready || !props.focus || props.focus.scope === 'worldwide') return;
    map.current?.flyTo({
      center: [props.focus.longitude, props.focus.latitude], zoom: 3.1,
      duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1400,
      essential: false,
    });
  }, [props.focus, ready]);

  return (
    <div className="atlas-globe">
      <div ref={container} className="map-canvas" role="region" aria-label="Interactive world map. Drag to explore or select a report marker." />
      <div className="map-overline"><span className="live-dot" /> 20 ATTEMPTS / 20 LESSONS <span className="map-overline-right">FROM FORDLANDIA TO BIOSPHERE 2</span></div>
      {!ready && !error && <div className="map-state"><Globe2 className="map-loading-icon" /><span>UNFOLDING THE WORLD</span></div>}
      {error && <div className="map-state map-error"><Globe2 size={40} /><p>{error}</p></div>}
      <div className="map-controls" aria-label="Map controls">
        <button aria-label="Zoom in" onClick={() => map.current?.zoomIn()}><Plus size={18} /></button>
        <button aria-label="Zoom out" onClick={() => map.current?.zoomOut()}><Minus size={18} /></button>
        <button aria-label="Reset globe view" onClick={() => map.current?.flyTo({ center: [10, 22], zoom: 1.45, bearing: 0, pitch: 0, duration: 1000 })}><Compass size={19} /></button>
      </div>
      {hovered && <div className="map-hover-card" style={{ '--case-color': categoryInfo(hovered.category).color } as React.CSSProperties}><span className="eyebrow">{hovered.location} · {hovered.period}</span><strong>{hovered.title}</strong><span>{hovered.subtitle || hovered.status}</span></div>}
      <div className="map-caption"><span>DRAG TO EXPLORE <span className="caption-cross">+</span> CLICK ANYWHERE TO RESEARCH</span><span>{coordinates}</span></div>
      <div className="globe-watermark" aria-hidden="true">AMBITION LEAVES<br />A GEOGRAPHY.</div>
    </div>
  );
}
