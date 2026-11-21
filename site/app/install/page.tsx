import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";

import { CopyButton } from "@/components/CopyButton";
import { DEMO_URL, DOCS_URL, GITHUB_URL, HOSTED_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Install",
  description:
    "Install OpenPrintDash with Docker Compose. Prerequisites, setup wizard, printer credentials, updates and troubleshooting.",
};

const commands = {
  install: `curl -fsSL https://raw.githubusercontent.com/SchlangeGoto/open-print-dashboard/main/install.sh | bash`,
};

const credentials = [
  {
    value: "Serial number",
    where: "Settings, Device, Serial Number (also on the sticker on the back)",
  },
];

function Step({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-[var(--color-rule)] py-10 first:border-t-0 first:pt-0">
      <div className="flex gap-5">
        <span className="mt-0.5 text-sm font-medium text-[var(--color-accent)]">
          {number}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          <div className="mt-3 text-sm leading-6 text-[var(--color-muted)]">
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function InstallPage() {
  return (
    <div className="container-page py-16 md:py-24">
      <Link
        href="/"
        className="text-sm text-[var(--color-muted)] transition-colors hover:text-[var(--color-ink)]"
      >
        Back to home
      </Link>

      <div className="mt-10 max-w-3xl">
        <h1 className="text-section font-semibold leading-[1.02] tracking-[var(--tracking-display)]">
          One Docker stack. A short setup.
        </h1>
        <p className="mt-6 text-base leading-7 text-[var(--color-muted)] md:text-lg md:leading-8">
          OpenPrintDash runs on your machine. You need Docker, a Bambu Lab
          account and your printer&apos;s serial number. The first build takes a
          few minutes; later starts are fast.
        </p>
      </div>

      <div className="mt-12 grid gap-16 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-20">
        <div className="min-w-0">
          <Step number="01" title="Run the installer">
            <p>
              The installer asks about your domain, whether you already have a
              reverse proxy, and the first admin account. It downloads the
              release Compose files and starts the published images. No clone
              or build step is needed.
            </p>
            <div className="mt-4 flex items-center justify-between rounded-lg border border-[var(--color-rule)] bg-[var(--color-code-bg)] px-4 py-2">
              <span className="text-sm text-[var(--color-muted)]">
                Terminal
              </span>
              <CopyButton value={commands.install} />
            </div>
            <pre className="code-block mt-2 p-4">
              <code>{commands.install}</code>
            </pre>
          </Step>

          <Step number="02" title="Answer the installer">
            <p>
              Choose bundled Caddy for automatic TLS, or point the installer at
              your existing reverse proxy. It prints the DNS record, port
              forwarding and proxy routes for the choice you made, then waits
              for the dashboard to become healthy.
            </p>
          </Step>

          <Step number="03" title="Open the dashboard">
            <p>
              Open the domain you entered. Sign in with the admin account the
              installer created, connect your Bambu Lab account, and add the
              printer.
            </p>
          </Step>

          <Step number="04" title="Connect Bambu Lab and add the printer">
            <p>
              Sign in with the admin account, connect the Bambu Lab account
              used for printer and history sync, then pick the printer from the
              list. Credentials are encrypted at rest.
            </p>
          </Step>

          <section className="border-t border-[var(--color-rule)] py-10">
            <h2 className="text-xl font-semibold tracking-tight">
              Finding your printer
            </h2>
            <div className="mt-4 overflow-hidden rounded-lg border border-[var(--color-rule)]">
              <table className="w-full text-left text-sm">
                <thead className="bg-[var(--color-surface-glass)] text-[var(--color-muted)]">
                  <tr>
                    <th className="px-4 py-3 font-medium">Value</th>
                    <th className="px-4 py-3 font-medium">Where to find it</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-rule)] text-[var(--color-muted)]">
                  {credentials.map((item) => (
                    <tr key={item.value}>
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-[var(--color-ink)]">
                        {item.value}
                      </td>
                      <td className="px-4 py-3">{item.where}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <a
              href="https://wiki.bambulab.com/en/general/find-sn"
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex text-sm text-[var(--color-muted)] hover:text-[var(--color-ink)]"
            >
              Bambu Lab wiki: finding your serial number
            </a>
          </section>

          <section className="border-t border-[var(--color-rule)] py-10">
            <h2 className="text-xl font-semibold tracking-tight">Updating</h2>
            <p className="mt-3 text-sm leading-6 text-[var(--color-muted)]">
              Pull the new code, rebuild the images, and keep your database
              volume:
            </p>
            <pre className="code-block mt-4 p-4">
              <code>{`git pull
docker compose -f compose.prod.yml down
docker compose -f compose.prod.yml up -d --build`}</code>
            </pre>
            <p className="mt-3 text-sm leading-6 text-[var(--color-muted)]">
              Data lives in the{" "}
              <code className="rounded bg-[var(--color-surface-glass)] px-1.5 py-0.5 font-mono text-xs">
                postgres_data
              </code>{" "}
              Docker volume and survives updates.
            </p>
          </section>

          <section className="border-t border-[var(--color-rule)] py-10">
            <h2 className="text-xl font-semibold tracking-tight">
              If something goes wrong
            </h2>
            <div className="mt-4 space-y-4 text-sm leading-6 text-[var(--color-muted)]">
              <p>
                <strong className="text-[var(--color-ink)]">
                  Port 3000 is in use.
                </strong>{" "}
                Change the frontend port mapping in{" "}
                <code className="rounded bg-[var(--color-surface-glass)] px-1.5 py-0.5 font-mono text-xs">
                  compose.prod.yml
                </code>
                .
              </p>
              <p>
                <strong className="text-[var(--color-ink)]">
                  The printer is offline.
                </strong>{" "}
                Check that it is online in Bambu Handy, and that your Bambu Lab
                account is connected in Settings.
              </p>
              <p>
                <strong className="text-[var(--color-ink)]">
                  The first build is slow.
                </strong>{" "}
                Docker is building the Next.js and FastAPI images. Later starts
                are fast.
              </p>
            </div>
            <div className="mt-6 flex flex-wrap gap-4 text-sm">
              <a
                href={`${GITHUB_URL}/issues`}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-[var(--color-ink)] underline decoration-[var(--color-rule)] underline-offset-4 hover:decoration-[var(--color-rule-strong)]"
              >
                Open an issue
              </a>
              <a
                href={DOCS_URL}
                target="_blank"
                rel="noreferrer"
                className="text-[var(--color-muted)] hover:text-[var(--color-ink)]"
              >
                Read the docs
              </a>
            </div>
          </section>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-xl border border-[var(--color-rule)] bg-[var(--color-paper-2)] p-5">
            <h2 className="text-sm font-medium">Before you start</h2>
            <ul className="mt-4 space-y-3 text-sm text-[var(--color-muted)]">
              {[
                "Docker Engine and Docker Compose",
                "Git",
                "A Bambu Lab account",
                "A printer bound to that account in Bambu Handy",
              ].map((item) => (
                <li key={item} className="flex gap-2.5">
                  <Check className="mt-0.5 size-4 shrink-0 text-[var(--color-success)]" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-[var(--color-rule)] bg-[var(--color-paper-2)] p-5">
            <h2 className="text-sm font-medium">What runs where</h2>
            <dl className="mt-4 space-y-4 text-sm">
              <div>
                <dt className="font-medium text-[var(--color-ink)]">
                  On your server
                </dt>
                <dd className="mt-1 text-[var(--color-muted)]">
                  The app, PostgreSQL, print history, filament and spool data.
                </dd>
              </div>
              <div>
                <dt className="font-medium text-[var(--color-ink)]">
                  Bambu Cloud
                </dt>
                <dd className="mt-1 text-[var(--color-muted)]">
                  Account login, printer discovery and history or covers where
                  cloud sync is used.
                </dd>
              </div>
              <div>
                <dt className="font-medium text-[var(--color-ink)]">
                  Nowhere else
                </dt>
                <dd className="mt-1 text-[var(--color-muted)]">
                  No analytics, no telemetry, no third-party tracking.
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-xl border border-[var(--color-accent-strong)] bg-[var(--color-accent-soft)] p-5">
            <h2 className="text-sm font-medium">Not ready to install?</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
              Open the demo first. It runs the real dashboard with simulated
              printers and seeded data.
            </p>
            <a
              href={DEMO_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex text-sm font-medium text-[var(--color-accent)] hover:text-[var(--color-ink)]"
            >
              Open the live demo
            </a>
          </div>

          <div className="rounded-xl border border-[var(--color-rule)] bg-[var(--color-paper-2)] p-5">
            <h2 className="text-sm font-medium">Want it managed?</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
              The hosted service is for people who would rather not run Docker,
              a database or updates themselves.
            </p>
            <a
              href={HOSTED_URL}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex text-sm font-medium text-[var(--color-accent)] hover:text-[var(--color-ink)]"
            >
              See managed hosting
            </a>
          </div>
        </aside>
      </div>
    </div>
  );
}
