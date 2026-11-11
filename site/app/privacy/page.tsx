import type { Metadata } from "next";
import Link from "next/link";

import { GITHUB_URL, ISSUES_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "How OpenPrintDash handles data: no cookies, no trackers, no telemetry. The demo stores data in your browser; the self-hosted app stores data on your server.",
};

export default function PrivacyPage() {
  return (
    <div className="container-page py-16 md:py-24">
      <Link
        href="/"
        className="text-sm text-[var(--color-muted)] transition-colors hover:text-[var(--color-ink)]"
      >
        Back to home
      </Link>

      <article className="mt-10 max-w-3xl">
        <h1 className="text-section font-semibold leading-[1.02] tracking-[var(--tracking-display)]">
          Privacy, in plain language.
        </h1>
        <p className="mt-6 text-base leading-7 text-[var(--color-muted)]">
          OpenPrintDash is self-hosted software. This website is a static site.
          The demo is a browser-only build. Neither uses cookies, analytics or
          third-party trackers.
        </p>
        <p className="mt-3 text-sm text-[var(--color-muted-2)]">
          Last updated 8 November 2026.
        </p>

        <div className="mt-12 space-y-10 text-sm leading-7 text-[var(--color-muted)]">
          <section>
            <h2 className="text-lg font-semibold tracking-tight text-[var(--color-ink)]">
              This website
            </h2>
            <p className="mt-3">
              There are no cookies, no analytics scripts and no embedded
              third-party widgets. Fonts are served with the site. Server logs
              from the hosting provider may contain standard request data (IP
              address, user agent, timestamp) for security and uptime. They are
              not used to build a profile.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold tracking-tight text-[var(--color-ink)]">
              The live demo
            </h2>
            <p className="mt-3">
              The demo runs entirely in your browser with seeded data. Anything
              you change is stored in your browser{" "}
              <code className="rounded bg-[var(--color-surface-glass)] px-1.5 py-0.5 font-mono text-xs">
                localStorage
              </code>{" "}
              and can be reset from the demo menu. Nothing is sent to a server.
              Clearing your browser storage removes it.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold tracking-tight text-[var(--color-ink)]">
              The self-hosted app
            </h2>
            <p className="mt-3">
              When you run OpenPrintDash yourself, the application, database,
              print history, filament and spool data live on your server. Your
              Bambu Cloud credentials are encrypted at
              rest with a key derived from your{" "}
              <code className="rounded bg-[var(--color-surface-glass)] px-1.5 py-0.5 font-mono text-xs">
                SECRET_KEY
              </code>
              .
            </p>
            <p className="mt-3">
              Bambu Lab cloud is used for account login and for features such as
              printer discovery and history or covers where cloud sync is
              enabled. That traffic goes to Bambu Lab under their terms, not to
              us. The app has no analytics or telemetry.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold tracking-tight text-[var(--color-ink)]">
              Hosted beta
            </h2>
            <p className="mt-3">
              A small managed beta exists for people who want the dashboard
              without running a server. It has its own privacy policy covering
              billing, hosting and data processing, and a one-click export so
              you can move back to self-hosting.
            </p>
          </section>

          <section id="trademark">
            <h2 className="text-lg font-semibold tracking-tight text-[var(--color-ink)]">
              Trademark notice
            </h2>
            <p className="mt-3">
              OpenPrintDashboard is an independent community project. It is not
              affiliated with, endorsed by or supported by Bambu Lab. Bambu Lab
              and related marks are trademarks of their respective owner.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold tracking-tight text-[var(--color-ink)]">
              Questions
            </h2>
            <p className="mt-3">
              Open an issue on GitHub for privacy questions. Please report
              security problems privately through the repository&apos;s
              security advisories, not in a public issue, so there is time to
              fix them.
            </p>
            <a
              href={`${GITHUB_URL}/security/advisories/new`}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex font-medium text-[var(--color-ink)] underline decoration-[var(--color-rule)] underline-offset-4 hover:decoration-[var(--color-rule-strong)]"
            >
              Report a vulnerability privately
            </a>
            <div className="mt-4 flex flex-wrap gap-4">
              <a
                href={ISSUES_URL}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-[var(--color-ink)] underline decoration-[var(--color-rule)] underline-offset-4 hover:decoration-[var(--color-rule-strong)]"
              >
                Open an issue
              </a>
              <a
                href={`${GITHUB_URL}/blob/main/LICENSE`}
                target="_blank"
                rel="noreferrer"
                className="text-[var(--color-muted)] hover:text-[var(--color-ink)]"
              >
                AGPL-3.0 license
              </a>
            </div>
          </section>
        </div>
      </article>
    </div>
  );
}
