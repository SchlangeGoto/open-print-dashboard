import Link from "next/link";

import { SpoolMark } from "@/components/SpoolMark";
import { SITE_NAME } from "@/lib/site";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      className="group inline-flex items-center gap-2.5 text-sm font-semibold tracking-tight"
      aria-label={`${SITE_NAME} home`}
    >
      <SpoolMark className="size-7 shrink-0 text-[var(--color-brand-mark)] transition-opacity group-hover:opacity-90" />
      <span className={compact ? "hidden sm:inline" : ""}>{SITE_NAME}</span>
    </Link>
  );
}
