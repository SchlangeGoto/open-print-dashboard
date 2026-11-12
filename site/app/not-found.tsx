import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container-page flex min-h-[60vh] flex-col items-start justify-center py-24">
      <h1 className="text-section font-semibold leading-[1.02] tracking-[var(--tracking-display)]">
        That page is not in the library.
      </h1>
      <p className="mt-4 max-w-xl text-sm leading-6 text-[var(--color-muted)]">
        The link may be old, or the page may not exist yet. The dashboard is
        still where you left it.
      </p>
      <Link
        href="/"
        className="mt-8 inline-flex items-center rounded-md bg-[var(--color-accent-strong)] px-5 py-3 text-sm font-medium text-[var(--color-accent-strong-ink)] transition-colors hover:bg-[var(--color-accent-hover)]"
      >
        Back to home
      </Link>
    </div>
  );
}
