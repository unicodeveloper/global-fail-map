import { ArrowUpRight, Newspaper } from 'lucide-react';
import {
  archiveSearchUrl,
  archiveYearLabel,
  archiveYears,
} from '@/lib/archiving';

interface ArchiveLinkProps {
  subject: string;
  category: string;
  period?: string;
  year?: number;
}

/**
 * Sends the reader to contemporary Nigerian press coverage of the subject.
 * The archive's search results are rendered in the browser, so a search engine
 * never surfaces them and a reader has no way to find this coverage from the
 * report alone.
 */
export function ArchiveLink({
  subject,
  category,
  period,
  year,
}: ArchiveLinkProps) {
  const years = archiveYears(period, year);
  const url = archiveSearchUrl({ subject, category, years });
  if (!url) return null;
  const label = archiveYearLabel(years);

  return (
    <section className="dossier-archive">
      <div className="dossier-section-heading">
        <h2>In the Nigerian press</h2>
        {label && <span>{label}</span>}
      </div>
      <p className="dossier-archive-note">
        Newspapers and magazines digitised by archivi.ng, including reporting
        from the years this was happening.
      </p>
      <a
        className="dossier-archive-link"
        href={url}
        target="_blank"
        rel="noopener noreferrer"
      >
        <Newspaper size={17} aria-hidden="true" />
        <span>
          <strong>Search the newspaper archive</strong>
          <span>archivi.ng</span>
        </span>
        <ArrowUpRight size={15} aria-hidden="true" />
      </a>
    </section>
  );
}
