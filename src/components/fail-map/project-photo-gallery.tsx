'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import Image from 'next/image';
import * as Dialog from '@radix-ui/react-dialog';
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Images,
  LoaderCircle,
  X,
} from 'lucide-react';
import { publicImageUrl, type ProjectImage } from '@/lib/project-images';
import './project-photo-gallery.css';

interface ProjectPhotoGalleryProps {
  projectName: string;
  locationName?: string;
  autoLoad?: boolean;
  subjects?: string[];
  initialImages?: ProjectImage[];
}

const photoCache = new Map<string, ProjectImage[]>();

export function ProjectPhotoGallery(props: ProjectPhotoGalleryProps) {
  return (
    <ProjectPhotos
      key={JSON.stringify([
        props.projectName,
        props.locationName,
        props.subjects,
      ])}
      {...props}
    />
  );
}

function ProjectPhotos({
  projectName,
  locationName,
  autoLoad = false,
  subjects,
  initialImages,
}: ProjectPhotoGalleryProps) {
  const subjectsKey = JSON.stringify(subjects);
  const cacheKey = JSON.stringify([projectName, locationName, subjects]);
  const [photos, setPhotos] = useState<ProjectImage[] | null>(
    initialImages?.length ? initialImages : null,
  );
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const images = (photos || []).filter((image) => !failed.has(image.url));
  const selectedIndex =
    selected === null ? 0 : Math.min(selected, images.length - 1);
  const active = selected === null ? null : images[selectedIndex];

  useEffect(() => () => requestRef.current?.abort(), []);

  const loadPhotos = useCallback(async () => {
    if (requestRef.current) return;
    const cached = photoCache.get(cacheKey);
    if (cached) {
      setPhotos(cached);
      return;
    }
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/project-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName,
          ...(subjectsKey ? { subjects: JSON.parse(subjectsKey) } : {}),
          ...(locationName ? { locationName } : {}),
        }),
        signal: controller.signal,
      });
      if (response.status === 401) {
        setPhotos([]);
        return;
      }
      if (!response.ok)
        throw new Error('Photo search is unavailable. Please try again.');
      const data = await response.json();
      if (!Array.isArray(data.images))
        throw new Error('Photo search is unavailable. Please try again.');
      const found: ProjectImage[] = data.images
        .filter(
          (image: ProjectImage) =>
            image &&
            publicImageUrl(image.url) &&
            publicImageUrl(image.sourceUrl) &&
            typeof image.title === 'string',
        )
        .slice(0, 5);
      if (photoCache.size >= 24)
        photoCache.delete(photoCache.keys().next().value!);
      photoCache.set(cacheKey, found);
      setPhotos(found);
    } catch {
      if (!controller.signal.aborted)
        setError('Photo search is unavailable. Please try again.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
      requestRef.current = null;
    }
  }, [cacheKey, projectName, locationName, subjectsKey]);

  useEffect(() => {
    if (!autoLoad || initialImages?.length) return;
    const timer = window.setTimeout(() => void loadPhotos(), 300);
    return () => window.clearTimeout(timer);
  }, [autoLoad, loadPhotos, initialImages?.length]);

  function imageFailed(url: string) {
    setFailed((previous) => new Set(previous).add(url));
  }

  function step(direction: number) {
    setSelected(
      (previous) =>
        ((previous ?? 0) + direction + images.length) % images.length,
    );
  }

  if (!loading && photos !== null && images.length === 0 && !error) return null;

  return (
    <section className="project-photos" aria-label="Project photographs">
      <div className="project-photos-heading">
        {photos === null && autoLoad && !error ? (
          <span>
            <LoaderCircle size={15} className="project-photos-spinner" />
            Finding photos
          </span>
        ) : photos === null ? (
          <button
            type="button"
            className="project-photos-action"
            onClick={loadPhotos}
            disabled={loading}
          >
            {loading ? (
              <LoaderCircle
                size={15}
                className="project-photos-spinner"
                aria-hidden="true"
              />
            ) : (
              <Images size={15} aria-hidden="true" />
            )}
            {loading ? 'Finding photos' : error ? 'Retry photos' : 'Photos'}
          </button>
        ) : (
          <span>
            <Images size={15} aria-hidden="true" /> Photos
          </span>
        )}
        <span className="project-photos-status" role="status">
          {error ||
            (photos !== null && images.length === 0
              ? 'No photos available.'
              : '')}
        </span>
      </div>
      {images.length > 0 && (
        <div
          className="project-photos-deck"
          style={{ '--photo-count': images.length } as CSSProperties}
        >
          {images.map((image, index) => (
            <button
              key={image.url}
              type="button"
              className="project-photo-card"
              style={
                {
                  '--photo-angle': `${[-3, 2, -2, 3, -1][index]}deg`,
                } as CSSProperties
              }
              onClick={() => setSelected(index)}
              aria-label={`Open photo ${index + 1}: ${image.title}`}
            >
              <Image
                src={image.url}
                alt={`Image from ${image.title}`}
                fill
                sizes="180px"
                unoptimized
                referrerPolicy="no-referrer"
                onError={() => imageFailed(image.url)}
              />
            </button>
          ))}
        </div>
      )}
      <Dialog.Root
        open={Boolean(active)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="project-photo-overlay" />
          <Dialog.Content
            className="project-photo-lightbox"
            aria-describedby={undefined}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                event.preventDefault();
                step(event.key === 'ArrowRight' ? 1 : -1);
              }
            }}
          >
            <Dialog.Title className="sr-only">
              Photos of {projectName}
            </Dialog.Title>
            <Dialog.Close
              className="project-photo-control project-photo-close"
              aria-label="Close photos"
            >
              <X size={22} />
            </Dialog.Close>
            {active && (
              <>
                <div className="project-photo-full">
                  <Image
                    key={active.url}
                    src={active.url}
                    alt={`Image from ${active.title}`}
                    fill
                    sizes="90vw"
                    unoptimized
                    referrerPolicy="no-referrer"
                    onError={() => imageFailed(active.url)}
                  />
                </div>
                {images.length > 1 && (
                  <>
                    <button
                      type="button"
                      className="project-photo-control project-photo-previous"
                      aria-label="Previous photo"
                      onClick={() => step(-1)}
                    >
                      <ChevronLeft size={28} />
                    </button>
                    <button
                      type="button"
                      className="project-photo-control project-photo-next"
                      aria-label="Next photo"
                      onClick={() => step(1)}
                    >
                      <ChevronRight size={28} />
                    </button>
                  </>
                )}
                <div className="project-photo-caption">
                  <a
                    href={active.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    referrerPolicy="no-referrer"
                  >
                    {active.title}
                    <ArrowUpRight size={14} aria-hidden="true" />
                  </a>
                  <span aria-live="polite">
                    {selectedIndex + 1} / {images.length}
                  </span>
                </div>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}
