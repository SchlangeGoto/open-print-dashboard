"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";

import { Logo } from "@/components/Logo";
import { DEMO_URL, DOCS_URL, GITHUB_URL } from "@/lib/site";

const links = [
  { href: "/#features", label: "Features" },
  { href: "/install/", label: "Install" },
  { href: DOCS_URL, label: "Docs", external: true },
  { href: GITHUB_URL, label: "GitHub", external: true },
];

export function SiteNav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--color-rule)] bg-[var(--color-paper)]">
      <div className="container-page flex h-16 items-center justify-between gap-6">
        <Logo />

        <nav className="hidden items-center gap-7 text-sm text-[var(--color-muted)] md:flex">
          {links.map((link) => (
            <a
              key={link.label}
              href={link.href}
              target={link.external ? "_blank" : undefined}
              rel={link.external ? "noreferrer" : undefined}
              className="transition-colors hover:text-[var(--color-ink)]"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <a
            href={DEMO_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 items-center rounded-md bg-[var(--color-accent-strong)] px-4 text-sm font-medium text-[var(--color-accent-strong-ink)] transition-colors hover:bg-[var(--color-accent-hover)]"
          >
            Live demo
          </a>
        </div>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="inline-flex size-11 items-center justify-center rounded-md border border-[var(--color-rule)] text-[var(--color-muted)] md:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
        >
          {open ? <X className="size-4" /> : <Menu className="size-4" />}
        </button>
      </div>

      {open ? (
        <div className="border-t border-[var(--color-rule)] bg-[var(--color-paper)] md:hidden">
          <nav className="container-page flex flex-col py-4">
            {links.map((link) => (
              <a
                key={link.label}
                href={link.href}
                target={link.external ? "_blank" : undefined}
                rel={link.external ? "noreferrer" : undefined}
                onClick={() => setOpen(false)}
                className="border-b border-[var(--color-rule)] py-3 text-sm text-[var(--color-muted)] last:border-0"
              >
                {link.label}
              </a>
            ))}
            <a
              href={DEMO_URL}
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
              className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md bg-[var(--color-accent-strong)] px-4 text-sm font-medium text-[var(--color-accent-strong-ink)]"
            >
              Open the live demo
            </a>
            <Link
              href="/install/"
              onClick={() => setOpen(false)}
              className="mt-2 inline-flex min-h-11 items-center justify-center rounded-md border border-[var(--color-rule-strong)] px-4 text-sm font-medium"
            >
              Install it yourself
            </Link>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
