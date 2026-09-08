import type { Location } from './types';

export interface MapCameraTarget {
  center: [number, number];
  zoom: number;
}

export function getMapCameraTarget(
  focus: Location | null,
  variant: 'atlas' | 'report' | undefined,
  containerWidth: number,
): MapCameraTarget {
  const location = focus?.scope === 'worldwide' ? null : focus;
  return {
    center: location ? [location.longitude, location.latitude] : [10, 22],
    zoom: location
      ? variant === 'report'
        ? 4
        : 2.5
      : containerWidth < 640
        ? 0.8
        : 1.6,
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
