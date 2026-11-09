import Link from "next/link";
import { Check, GitBranch, Smartphone } from "lucide-react";

import { CopyButton } from "@/components/CopyButton";
import { DashboardStage } from "@/components/DashboardStage";
import { FeatureShowcase } from "@/components/FeatureShowcase";
import { NativePhones } from "@/components/NativePhones";
import { ScreenshotFrame } from "@/components/ScreenshotFrame";
import { DEMO_URL, DOCS_URL, GITHUB_URL, SITE_URL, SPONSOR_URL } from "@/lib/site";

const installCommands = `git clone https://github.com/SchlangeGoto/open-print-dashboard.git
cd open-print-dashboard
cp .env.example .env
docker compose up -d --build`;

const faqs = [
  {
    q: "Do I need a Bambu Lab account?",
    a: "Yes, Bambu Cloud is part of the connection and history sync today. The dashboard and your data still run on your own server.",
  },
  {
    q: "Does it work without internet?",
    a: "Not fully today. Bambu Cloud features need internet. Your self-hosted data stays on your server either way. Check the docs for the current connection modes.",
  },
  {
    q: "Which printers are supported?",
    a: "X1, P1 and A1 series are tested today. Check the docs for the current verified list.",
  },
  {
    q: "How accurate is the cost?",
    a: "It uses your spool price per kilogram and the slicer-reported weight. It is a material-cost estimate, not a utility bill. Energy and machine time are not included.",
  },
  {
    q: "Where are my printer credentials stored?",
    a: "Access codes and Bambu Cloud credentials are encrypted at rest with a key derived from your SECRET_KEY. They are sent to Bambu Cloud only when you use cloud features.",
  },
  {
    q: "How do updates work?",
    a: "Pull the new code and rebuild: git pull, then docker compose up -d --build. Your database lives in a Docker volume and survives updates.",
  },
];

export default function HomePage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "OpenPrintDash",
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Docker",
    url: SITE_URL,
    description:
      "Self-hosted dashboard for Bambu Lab 3D printers with live status, filament and spool inventory, print history and material cost.",
    offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
    license: "https://www.gnu.org/licenses/agpl-3.0.html",
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.q,
      acceptedAnswer: { "@type": "Answer", text: faq.a },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <section className="border-b border-[var(--color-rule)]">
        <div className="container-page pb-20 pt-16 md:pt-20">
          <div className="max-w-[1100px]">
            <h1 className="text-display font-semibold leading-[0.95] tracking-[var(--tracking-display)]">
              <span className="block md:inline">Every print.</span>{" "}
              <span className="block md:inline">Every spool.</span>
              <br className="hidden md:block" />{" "}
              <span className="block md:inline">Your dashboard.</span>
            </h1>
            <p className="mt-6 max-w-[52ch] text-lead leading-8 text-[var(--color-muted)]">
              Live status, filament stock and material costs, self-hosted in one
              Docker container.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                href={DEMO_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-md bg-[var(--color-accent-strong)] px-5 py-3 text-sm font-medium text-[var(--color-accent-strong-ink)] transition-colors hover:bg-[var(--color-accent-hover)]"
              >
                Open the live demo
              </a>
              <Link
                href="/install/"
                className="inline-flex items-center justify-center rounded-md border border-[var(--color-rule-strong)] px-5 py-3 text-sm font-medium text-[var(--color-ink)] transition-colors hover:bg-[var(--color-surface-hover)]"
              >
                Install it yourself
              </Link>
            </div>
            <p className="mt-5 text-sm text-[var(--color-muted-2)]">
              Runs in Docker. Works with Bambu Lab X1, P1 and A1. AGPL-3.0.
            </p>
          </div>

          <DashboardStage
            src="/screenshots/overview.jpg"
            alt="OpenPrintDash dashboard with filament stock, current prints and live printer cards"
            backLayers={[
              { src: "/screenshots/spools.jpg", className: "stage-layer-left" },
              { src: "/screenshots/analytics.jpg", className: "stage-layer-right" },
            ]}
            className="mt-12 md:mt-14"
          />
        </div>
      </section>

      <section
        id="features"
        data-reveal
        className="border-b border-[var(--color-rule)] py-[var(--section-gap-s)] md:py-[var(--section-gap)]"
      >
        <div className="container-page">
          <div className="max-w-2xl">
            <h2 className="text-section font-semibold leading-[1.02] tracking-[var(--tracking-display)]">
              One dashboard. Six jobs.
            </h2>
            <p className="mt-5 text-base leading-7 text-[var(--color-muted)]">
              Understand a print and the material it consumed without a
              spreadsheet, a tab farm or a cloud account you do not control.
            </p>
          </div>

          <FeatureShowcase />
        </div>
      </section>

      <section data-reveal className="border-b border-[var(--color-rule)] py-[var(--section-gap-s)] md:py-[var(--section-gap)]">
        <div className="container-page grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
          <div>
            <h2 className="text-section font-semibold leading-[1.02] tracking-[var(--tracking-display)]">
              See the print, not just the percentage.
            </h2>
            <p className="mt-5 text-base leading-7 text-[var(--color-muted)]">
              Nozzle and bed temperatures with targets, progress and layers,
              time remaining, fan speed and speed level. If the connection
              drops, it reconnects. If a printer is offline, it says so.
            </p>
            <ul className="mt-7 space-y-3 text-sm text-[var(--color-muted)]">
              {[
                "Nozzle and bed temperature, current and target",
                "Progress, layer count and time remaining",
                "Fan speed, speed level and online state",
                "Automatic reconnect after a network blip",
              ].map((item) => (
                <li key={item} className="flex gap-3">
                  <Check className="mt-0.5 size-4 shrink-0 text-[var(--color-success)]" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <ScreenshotFrame
            src="/screenshots/printer-detail.jpg"
            alt="Close-up of an X1 Carbon printer card with nozzle and bed temperatures, print progress and loaded spool"
            width={1240}
            height={1000}
            caption="Demo data"
          />
        </div>
      </section>

      <section data-reveal className="surface-emerald border-b border-[var(--color-emerald-border)] py-[var(--section-gap-s)] md:py-[var(--section-gap)]">
        <div className="container-page">
          <div className="max-w-2xl">
            <h2 className="text-balance text-section font-semibold leading-[1.02] tracking-[var(--tracking-display)]">
              Know what is left before you print.
            </h2>
            <p className="mt-5 max-w-xl text-base leading-7 text-[var(--color-emerald-muted)]">
              A library of every filament, a spool for every roll, and a running
              answer to whether you have enough for the next print. Usage is
              deducted after each job.
            </p>
          </div>

          <ScreenshotFrame
            src="/screenshots/spools.jpg"
            alt="OpenPrintDash spool library with individual spools, remaining weight, price per kilogram and loaded status"
            className="mt-12"
            caption="Demo data"
          />

          <div className="mt-14 grid items-center gap-12 xl:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)] xl:gap-16">
            <div>
              <div className="flex items-center gap-3 text-[var(--color-emerald-ink)]">
                <Smartphone className="size-5" strokeWidth={1.7} />
                <p className="text-sm font-medium">Native companion app</p>
              </div>
              <h3 className="mt-5 text-balance text-2xl font-semibold leading-tight tracking-tight">
                Scan a spool with your phone.
              </h3>
              <p className="mt-3 max-w-[44ch] text-sm leading-6 text-[var(--color-emerald-muted)]">
                Point the native scanner at the Bambu box. Known barcodes create
                the spool; unknown ones ask for the details once. The phone reads
                the same inventory as the dashboard.
              </p>
              <ol className="mt-6 space-y-4">
                {[
                  ["01", "Open the scanner", "The system camera handles focus, torch and zoom."],
                  ["02", "Scan the box", "The barcode is checked against the Bambu catalog."],
                  ["03", "Spool added", "The roll is linked to the filament and ready to load."],
                ].map(([number, title, body]) => (
                  <li key={number} className="flex gap-3">
                    <span className="mt-0.5 text-sm font-medium text-[var(--color-emerald-ink)]">
                      {number}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-[var(--color-emerald-ink)]">
                        {title}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-[var(--color-emerald-muted)]">
                        {body}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="mt-6 text-xs leading-5 text-[var(--color-emerald-muted)]">
                Native iOS and Android app, connected to the same dashboard.
              </p>
            </div>

            <NativePhones />
          </div>
        </div>
      </section>

      <section data-reveal className="border-b border-[var(--color-rule)] py-[var(--section-gap-s)] md:py-[var(--section-gap)]">
        <div className="container-page">
          <div className="max-w-2xl">
            <h2 className="text-section font-semibold leading-[1.02] tracking-[var(--tracking-display)]">
              Every print, with the receipt.
            </h2>
            <p className="mt-5 text-base leading-7 text-[var(--color-muted)]">
              A searchable history with the file, weight, duration and outcome.
              Analytics roll it up into success rate, material used and what
              each print cost in filament.
            </p>
          </div>

          <ScreenshotFrame
            src="/screenshots/analytics.jpg"
            alt="OpenPrintDash analytics with success rate, print time, filament used, money spent and a print activity chart"
            className="mt-12"
            caption="Demo data"
          />

          <div className="mt-10 grid gap-8 md:grid-cols-2">
            <div>
              <h3 className="text-base font-medium">Filter the history</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                All, printing, completed or failed. Filter by filament. Sort by
                date, weight, duration or cost. Delete the jobs you do not need.
              </p>
            </div>
            <div>
              <h3 className="text-base font-medium">Cost that means something</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                Each job uses the spool price per kilogram and the
                slicer-reported weight. Change a spool price and future
                estimates follow.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section data-reveal className="border-b border-[var(--color-rule)] bg-[var(--color-paper-deep)] py-[var(--section-gap-s)] md:py-[var(--section-gap)]">
        <div className="container-page">
          <div className="max-w-2xl">
            <h2 className="text-section font-semibold leading-[1.02] tracking-[var(--tracking-display)]">
              Your data stays on your hardware.
            </h2>
            <p className="mt-5 text-base leading-7 text-[var(--color-muted)]">
              OpenPrintDash is software you run, not a service you subscribe to.
              The app, print history and inventory live on your hardware. Bambu
              Cloud is part of the printer connection, and we say so plainly.
            </p>
          </div>

          <dl className="mt-12 border-t border-[var(--color-rule)]">
            {[
              ["Stack", "Next.js, FastAPI and PostgreSQL in one Docker stack."],
              ["Data", "History, spools and costs in your own database."],
              ["Secrets", "Access codes and cloud credentials, encrypted at rest."],
              ["Cloud", "Bambu Cloud for account and history sync. No telemetry."],
            ].map(([term, value]) => (
              <div
                key={term}
                className="grid gap-2 border-b border-[var(--color-rule)] py-5 sm:grid-cols-[0.28fr_0.72fr]"
              >
                <dt className="text-sm font-medium">{term}</dt>
                <dd className="text-sm leading-6 text-[var(--color-muted)]">
                  {value}
                </dd>
              </div>
            ))}
          </dl>

          <div className="mt-10 flex flex-col gap-3 border-t border-[var(--color-rule)] pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-2xl text-sm leading-6 text-[var(--color-muted)]">
              Would rather not run the stack yourself? Managed hosting is in
              beta.
            </p>
            <Link
              href="/hosting/"
              className="shrink-0 text-sm font-medium text-[var(--color-accent)] transition-colors hover:text-[var(--color-ink)]"
            >
              See the hosting beta
            </Link>
          </div>
        </div>
      </section>

      <section data-reveal className="surface-light border-b border-[var(--color-light-rule)] bg-[var(--color-light-paper)] py-[var(--section-gap-s)] text-[var(--color-light-ink)] md:py-[var(--section-gap)]">
        <div className="container-page grid items-center gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-20">
          <div>
            <h2 className="text-section font-semibold leading-[1.02] tracking-[var(--tracking-display)]">
              Install it in one Docker stack.
            </h2>
            <p className="mt-5 text-base leading-7 text-[var(--color-light-muted)]">
              You need Docker, Docker Compose, a Bambu Lab account and your
              printer IP address and access code. The setup wizard walks you
              through the rest.
            </p>
            <div className="mt-6 flex flex-wrap gap-4 text-sm">
              <Link
                href="/install/"
                className="font-medium text-[var(--color-light-ink)] underline decoration-[var(--color-light-rule)] underline-offset-4 hover:decoration-[var(--color-light-muted)]"
              >
                Full install guide
              </Link>
              <a
                href={DOCS_URL}
                target="_blank"
                rel="noreferrer"
                className="text-[var(--color-light-muted)] hover:text-[var(--color-light-ink)]"
              >
                Read the docs
              </a>
            </div>
          </div>

          <div className="min-w-0">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm text-[var(--color-light-muted)]">
                Terminal
              </span>
              <CopyButton value={installCommands} tone="light" />
            </div>
            <pre className="code-block max-w-full p-5">
              <code>{installCommands}</code>
            </pre>
            <p className="mt-4 text-sm text-[var(--color-light-muted)]">
              Then open{" "}
              <span className="rounded bg-[var(--color-light-chip)] px-1.5 py-0.5 text-[var(--color-light-ink)]">
                http://localhost:3000
              </span>
            </p>
          </div>
        </div>
      </section>

      <section data-reveal className="border-b border-[var(--color-rule)] py-[var(--section-gap-s)] md:py-[var(--section-gap)]">
        <div className="container-page">
          <div className="rounded-xl border border-[var(--color-rule-strong)] bg-[var(--color-demo-surface)] p-8 md:p-14">
            <div className="grid gap-8 lg:grid-cols-[1fr_0.9fr] lg:items-center">
              <div className="max-w-2xl">
                <h2 className="text-section font-semibold leading-[1.02] tracking-[var(--tracking-display)]">
                  Poke around the real thing.
                </h2>
                <p className="mt-5 text-base leading-7 text-[var(--color-muted)]">
                  The demo runs the actual dashboard with simulated printers and
                  seeded spools. No signup, no install, no cleanup afterwards.
                </p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <a
                    href={DEMO_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center rounded-md bg-[var(--color-accent-strong)] px-5 py-3 text-sm font-medium text-[var(--color-accent-strong-ink)] transition-colors hover:bg-[var(--color-accent-hover)]"
                  >
                    Open the live demo
                  </a>
                  <Link
                    href="/install/"
                    className="inline-flex items-center justify-center rounded-md border border-[var(--color-rule-strong)] px-5 py-3 text-sm font-medium text-[var(--color-ink)] transition-colors hover:bg-[var(--color-surface-hover)]"
                  >
                    Install it yourself
                  </Link>
                </div>
              </div>

              <ScreenshotFrame
                src="/screenshots/print-jobs.jpg"
                alt="Print job history in OpenPrintDash with status, weight, duration, cost and finish time"
                caption="Demo data"
              />
            </div>
          </div>
        </div>
      </section>

      <section data-reveal className="border-b border-[var(--color-rule)] py-[var(--section-gap-s)] md:py-[var(--section-gap)]">
        <div className="container-page grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
          <div>
            <h2 className="text-section font-semibold leading-[1.02] tracking-[var(--tracking-display)]">
              The things people ask before installing.
            </h2>
            <p className="mt-5 text-sm leading-6 text-[var(--color-muted)]">
              Still unsure? Open an issue on GitHub. The answers usually end up
              in the docs.
            </p>
          </div>

          <div className="divide-y divide-[var(--color-rule)] border-y border-[var(--color-rule)]">
            {faqs.map((faq) => (
              <details key={faq.q} className="group py-5">
                <summary className="flex items-center justify-between gap-6 text-left text-sm font-medium">
                  {faq.q}
                  <span className="faq-plus grid size-6 shrink-0 place-items-center rounded-full border border-[var(--color-rule-strong)] text-[var(--color-muted)]">
                    +
                  </span>
                </summary>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--color-muted)]">
                  {faq.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section data-reveal className="py-[var(--section-gap-s)] md:py-[var(--section-gap)]">
        <div className="container-page grid gap-12 lg:grid-cols-2 lg:gap-20">
          <div>
            <h2 className="text-section font-semibold leading-[1.02] tracking-[var(--tracking-display)]">
              Built in the open.
            </h2>
            <p className="mt-5 max-w-xl text-base leading-7 text-[var(--color-muted)]">
              OpenPrintDashboard is AGPL-3.0. Read the code, run it, fork it,
              send a pull request. No open-core tricks, no feature gates, no
              telemetry.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-md border border-[var(--color-rule-strong)] px-4 py-2.5 text-sm font-medium transition-colors hover:bg-[var(--color-surface-hover)]"
              >
                <GitBranch className="size-4" />
                View on GitHub
              </a>
              <a
                href={`${GITHUB_URL}/blob/main/LICENSE`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded-md border border-[var(--color-rule-strong)] px-4 py-2.5 text-sm font-medium transition-colors hover:bg-[var(--color-surface-hover)]"
              >
                AGPL-3.0 license
              </a>
            </div>
          </div>

          <div className="border-t border-[var(--color-rule)]">
            {[
              [
                "The code is public.",
                "Read it, run it, fork it, send a pull request. The full history is on GitHub.",
              ],
              [
                "The data is yours.",
                "PostgreSQL on your machine. Back it up, move it, inspect it.",
              ],
              [
                "A hosted option is in beta.",
                "For people who want the dashboard without running a server. The beta is small; self-hosting stays free.",
              ],
            ].map(([title, body]) => (
              <div
                key={title}
                className="border-b border-[var(--color-rule)] py-5"
              >
                <h3 className="text-base font-medium">{title}</h3>
                <p className="mt-2 max-w-md text-sm leading-6 text-[var(--color-muted)]">
                  {body}
                </p>
              </div>
            ))}

            <div className="border-b border-[var(--color-rule)] py-5">
              <h3 className="text-base font-medium">Support the project.</h3>
              <p className="mt-2 max-w-md text-sm leading-6 text-[var(--color-muted)]">
                If OpenPrintDash saves you time, you can sponsor it on GitHub.
                Donations cover the demo, the domain and maintenance;
                self-hosting stays free.
              </p>
              <a
                href={SPONSOR_URL}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex text-sm font-medium text-[var(--color-accent)] transition-colors hover:text-[var(--color-ink)]"
              >
                Sponsor on GitHub
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
