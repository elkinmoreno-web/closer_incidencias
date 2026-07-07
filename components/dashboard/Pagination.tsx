import Link from 'next/link';
import { paginasAMostrar } from '@/lib/pagination';

export function Pagination({
  page,
  totalPages,
  basePath,
  searchParams,
}: {
  page: number;
  totalPages: number;
  basePath: string;
  searchParams: { [key: string]: string | undefined };
}) {
  if (totalPages <= 1) return null;

  const paginas = paginasAMostrar(page, totalPages);

  function hrefPagina(p: number) {
    const params = new URLSearchParams(searchParams as Record<string, string>);
    params.set('page', String(p));
    return `${basePath}?${params.toString()}`;
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5 text-sm">
      {paginas.map((p, idx) =>
        p === 'gap' ? (
          <span key={`gap-${idx}`} className="px-1.5 text-ink-muted">
            …
          </span>
        ) : (
          <Link
            key={p}
            href={hrefPagina(p)}
            className={`min-w-[2.25rem] rounded-full px-3 py-1.5 text-center ${
              p === page ? 'bg-primary text-white' : 'text-ink-muted hover:bg-surface'
            }`}
          >
            {p}
          </Link>
        )
      )}
    </div>
  );
}
