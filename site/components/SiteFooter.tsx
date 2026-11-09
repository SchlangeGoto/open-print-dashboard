import Link from "next/link";

import { Logo } from "@/components/Logo";
import {
  DEMO_URL,
  DOCS_URL,
  GITHUB_URL,
  ISSUES_URL,
  SITE_FULL_NAME,
  SPONSOR_URL,
} from "@/lib/site";

const columns = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "/#features" },
      { label: "Install", href: "/install/" },
      { label: "Managed hosting", href: "/hosting/" },
      { label: "Live demo", href: DEMO_URL, external: true },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Docs", href: DOCS_URL, external: true },
      { label: "GitHub", href: GITHUB_URL, external: true },
      { label: "Issues", href: ISSUES_URL, external: true },
    ],
  },
  {
    title: "Community",
    links: [
      { label: "Contributing", href: `${GITHUB_URL}#contributing`, external: true },
      { label: "Sponsor", href: SPONSOR_URL, external: true },
      { label: "Releases", href: `${GITHUB_URL}/releases`, external: true },
      { label: "Report an issue", href: ISSUES_URL, external: true },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "AGPL-3.0 license", href: `${GITHUB_URL}/blob/main/LICENSE`, external: true },
      { label: "Privacy", href: "/privacy/" },
      { label: "Trademark notice", href: "/privacy/#trademark" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--color-rule)] bg-[var(--color-paper-deep)]">
      <div className="container-page py-16">
        <div className="grid gap-12 md:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-sm leading-6 text-[var(--color-muted)]">
              {SITE_FULL_NAME} is a self-hosted dashboard for Bambu Lab
              printers. Your printer, your filament, your data.
            </p>
            <p className="mt-4 text-sm text-[var(--color-muted-2)]">
              AGPL-3.0. Made for the 3D printing community.
            </p>
          </div>

          {columns.map((column) => (
            <div key={column.title}>
              <h2 className="text-sm font-medium text-[var(--color-muted-2)]">
                {column.title}
              </h2>
              <ul className="mt-4 space-y-2.5 text-sm">
                {column.links.map((link) => (
                  <li key={link.label}>
                    {link.external ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[var(--color-muted)] transition-colors hover:text-[var(--color-ink)]"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className="text-[var(--color-muted)] transition-colors hover:text-[var(--color-ink)]"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col gap-4 border-t border-[var(--color-rule)] pt-6 text-sm text-[var(--color-muted-2)] md:flex-row md:items-center md:justify-between">
          <p>No cookies. No trackers.</p>
          <p>Bambu Lab is a trademark of its respective owner.</p>
        </div>
      </div>
    </footer>
  );
}
