import Link from "next/link";

import { SITE_NAME } from "@/lib/site";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      className="group inline-flex items-center gap-2.5 text-sm font-semibold tracking-tight"
      aria-label={`${SITE_NAME} home`}
    >
      <img
        src="/icon.svg"
        alt=""
        width={28}
        height={28}
        className="size-7 rounded-md border border-[var(--color-rule)] transition-opacity group-hover:opacity-90"
      />
      <span className={compact ? "hidden sm:inline" : ""}>{SITE_NAME}</span>
    </Link>
  );
}
