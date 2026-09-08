'use client';

import { memo, useState } from 'react';
import Image from 'next/image';
import { Globe2 } from 'lucide-react';
import { sourceHostname } from './report-utils';

export const SourceFavicon = memo(function SourceFavicon({
  url,
  size = 16,
}: {
  url: string;
  size?: number;
}) {
  const [failedUrl, setFailedUrl] = useState('');
  const domain = sourceHostname(url);
  const faviconUrl = domain
    ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`
    : '';

  return (
    <span
      className="source-favicon"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {!faviconUrl || failedUrl === faviconUrl ? (
        <Globe2 size={size} strokeWidth={1.5} />
      ) : (
        <Image
          src={faviconUrl}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          unoptimized
          referrerPolicy="no-referrer"
          onError={() => setFailedUrl(faviconUrl)}
        />
      )}
    </span>
  );
});
