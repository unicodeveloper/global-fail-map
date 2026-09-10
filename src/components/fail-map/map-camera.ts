import type { Location } from './types';

export interface MapCameraTarget {
  center: [number, number];
  zoom: number;
}

/**
 * The opening frame. A neutral Atlantic centre showed mostly ocean and left
 * two thirds of the atlas off screen, so the globe now opens over the
 * Atlantic rim, where the markers actually cluster: the Americas fall on the
 * left of the sphere and Europe on the right, both in view at once.
 */
const atlasHome: [number, number] = [-38, 26];

export function getMapCameraTarget(
  focus: Location | null,
  variant: 'atlas' | 'report' | undefined,
  containerWidth: number,
): MapCameraTarget {
  const location = focus?.scope === 'worldwide' ? null : focus;
  return {
    center: location ? [location.longitude, location.latitude] : atlasHome,
    zoom: location
      ? variant === 'report'
        ? 4
        : 2.5
      : containerWidth < 640
        ? 0.9
        : 1.7,
  };
}

export function sameMapCameraTarget(
  previous: MapCameraTarget | null,
  next: MapCameraTarget,
): boolean {
  return (
    previous?.center[0] === next.center[0] &&
    previous.center[1] === next.center[1] &&
    previous.zoom === next.zoom
  );
}

/**
 * The idle drift. A still globe reads as a photograph of the earth rather
 * than the earth itself, so the atlas turns eastward on its own whenever
 * nobody is touching it.
 */
export const spinDegreesPerSecond = 2.6;

/** How long the globe waits after a touch before it drifts again. */
export const spinResumeDelay = 2600;

/**
 * Degrees of longitude to give back for one animation frame. The drift eases
 * out as the reader zooms in, because the same angle sweeps the ground far
 * faster up close, and stops entirely once a country fills the screen. A long
 * frame gap - a stalled tab, a slow paint - is clamped so the globe resumes
 * where it left off instead of lurching.
 */
export function getGlobeSpinStep(zoom: number, elapsedMs: number): number {
  if (zoom >= 4) return 0;
  const easing = zoom <= 2 ? 1 : (4 - zoom) / 2;
  return (
    (spinDegreesPerSecond * easing * Math.min(Math.max(elapsedMs, 0), 100)) /
    1000
  );
}

/** Keeps a drifting centre inside the normal longitude range. */
export function wrapLongitude(longitude: number): number {
  return ((((longitude + 180) % 360) + 360) % 360) - 180;
}
