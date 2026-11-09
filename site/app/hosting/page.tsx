import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, Server, ShieldCheck, Sparkles } from "lucide-react";

import { HOSTING_BETA_MAILTO, SITE_FULL_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Managed hosting",
  description:
    "OpenPrintDash managed hosting is in beta. A managed dashboard without Docker, a database or update chores, while self-hosting stays free.",
};

const betaIncludes = [
  "The same dashboard and data model",
  "The server, database and updates handled for you",
  "A direct feedback line while the beta is small",
  "Limited seats",
];

const plans = [
  {
    name: "Beta",
    status: "Coming soon",
    body: "A managed OpenPrintDash instance for the first testers.",
    details: betaIncludes,
    active: true,
  },
  {
    name: "Standard",
    status: "After beta",
    body: "The regular managed plan once the beta settles.",
    details: ["Details to be announced", "Pricing to be announced"],
    active: false,
  },
  {
    name: "Team",
    status: "Later",
    body: "For shared setups and small print farms.",
    details: ["Details to be announced", "Pricing to be announced"],
    active: false,
  },
];

export default function HostingPage() {
  return (
    <div className="container-page py-16 md:py-24">
      <Link
        href="/"
        className="text-sm text-[var(--color-muted)] transition-colors hover:text-[var(--color-ink)]"
      >
        Back to home
      </Link>

      <div className="mt-10 max-w-3xl">
        <div className="inline-flex items-center gap-2 rounded-full border border-[var(--color-rule)] px-3 py-1 text-xs text-[var(--color-muted)]">
          <span className="size-1.5 rounded-full bg-[var(--color-accent)]" />
          Managed hosting · Beta
        </div>
        <h1 className="mt-6 text-display font-semibold leading-[1.02] tracking-[var(--tracking-display)]">
          The dashboard, without the server.
        </h1>
        <p className="mt-6 max-w-2xl text-lead leading-8 text-[var(--color-muted)]">
          {SITE_FULL_NAME}, hosted for you. For people who want the product
          without Docker, a database or update chores. Self-hosting stays free.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <a
            href={HOSTING_BETA_MAILTO}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-[var(--color-accent-strong)] px-5 py-3 text-sm font-medium text-[var(--color-accent-strong-ink)] transition-colors hover:bg-[var(--color-accent-hover)]"
          >
            Register beta interest
            <ArrowRight className="size-4" />
          </a>
          <Link
            href="/install/"
            className="inline-flex items-center justify-center rounded-md border border-[var(--color-rule-strong)] px-5 py-3 text-sm font-medium text-[var(--color-ink)] transition-colors hover:bg-[var(--color-surface-hover)]"
          >
            Keep self-hosting
          </Link>
        </div>
      </div>

      <div className="mt-16 grid gap-4 lg:grid-cols-3">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className={`flex flex-col rounded-xl border p-6 ${
              plan.active
                ? "border-[var(--color-accent-strong)] bg-[var(--color-accent-soft)]"
                : "border-[var(--color-rule)] bg-[var(--color-paper-2)]"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">{plan.name}</h2>
              <span
                className={`rounded-full px-2.5 py-1 text-xs ${
                  plan.active
                    ? "bg-[var(--color-accent-strong)] text-[var(--color-accent-strong-ink)]"
                    : "border border-[var(--color-rule)] text-[var(--color-muted-2)]"
                }`}
              >
                {plan.status}
              </span>
            </div>
            <p className="mt-3 text-sm leading-6 text-[var(--color-muted)]">
              {plan.body}
            </p>
            <ul className="mt-6 space-y-3 text-sm text-[var(--color-muted)]">
              {plan.details.map((detail) => (
                <li key={detail} className="flex gap-2.5">
                  {plan.active ? (
                    <Check className="mt-0.5 size-4 shrink-0 text-[var(--color-accent)]" />
                  ) : (
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-[var(--color-muted-2)]" />
                  )}
                  {detail}
                </li>
              ))}
            </ul>
            <div className="mt-auto pt-8">
              {plan.active ? (
                <a
                  href={HOSTING_BETA_MAILTO}
                  className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-accent)] hover:text-[var(--color-ink)]"
                >
                  Register interest
                  <ArrowRight className="size-4" />
                </a>
              ) : (
                <p className="text-sm text-[var(--color-muted-2)]">
                  Details after the beta.
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-5 max-w-2xl text-sm leading-6 text-[var(--color-muted-2)]">
        Only the beta is open today. Standard and Team are placeholders while
        the hosted product is being shaped; pricing will be published after the
        beta.
      </p>

      <section className="mt-16 border-t border-[var(--color-rule)] pt-10">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight">
            A small beta, run properly.
          </h2>
          <p className="mt-4 text-sm leading-6 text-[var(--color-muted)]">
            The beta is for people who want to try the product without running
            the stack themselves. We are keeping it small so feedback has
            somewhere to go.
          </p>
        </div>

        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          {[
            {
              icon: Sparkles,
              title: "Same product",
              body: "The managed instance runs the same dashboard, not a cut-down hosted edition.",
            },
            {
              icon: Server,
              title: "We run the boring parts",
              body: "The container, database and updates are handled for you during the beta.",
            },
            {
              icon: ShieldCheck,
              title: "Self-hosting stays free",
              body: "The AGPL-3.0 app remains available to run yourself. The beta is an option, not a replacement.",
            },
          ].map((item) => (
            <div key={item.title}>
              <item.icon className="size-5 text-[var(--color-accent)]" />
              <h3 className="mt-3 text-sm font-medium">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]">
                {item.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-16 border-t border-[var(--color-rule)] pt-10">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight">
            The questions we can answer today.
          </h2>
        </div>
        <div className="mt-6 divide-y divide-[var(--color-rule)] border-y border-[var(--color-rule)]">
          {[
            [
              "Is self-hosting going away?",
              "No. Self-hosting is the default, stays free, and remains AGPL-3.0. The hosted beta is for people who would rather not run a server.",
            ],
            [
              "How much will it cost?",
              "Pricing is not decided yet. It will be published before the beta starts billing, and the beta is for testing the hosted setup, not a hidden subscription.",
            ],
            [
              "What happens after I register?",
              "The beta has limited seats. We will reply when a slot opens. Registering does not create an account or start a subscription.",
            ],
            [
              "Can I still install it myself?",
              "Yes. The install guide covers Docker Compose, credentials and updates, and the live demo runs without a backend.",
            ],
          ].map(([question, answer]) => (
            <details key={question} className="group py-5">
              <summary className="flex items-center justify-between gap-6 text-left text-sm font-medium">
                {question}
                <span className="faq-plus grid size-6 shrink-0 place-items-center rounded-full border border-[var(--color-rule-strong)] text-[var(--color-muted)]">
                  +
                </span>
              </summary>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--color-muted)]">
                {answer}
              </p>
            </details>
          ))}
        </div>
      </section>

      <section className="mt-16 rounded-xl border border-[var(--color-rule-strong)] bg-[var(--color-paper-2)] p-8 md:p-10">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl">
            <h2 className="text-2xl font-semibold tracking-tight">
              Want a beta slot?
            </h2>
            <p className="mt-3 text-sm leading-6 text-[var(--color-muted)]">
              Tell us you are interested. The beta is small, so we will reply
              when a seat opens.
            </p>
          </div>
          <a
            href={HOSTING_BETA_MAILTO}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-[var(--color-accent-strong)] px-5 py-3 text-sm font-medium text-[var(--color-accent-strong-ink)] transition-colors hover:bg-[var(--color-accent-hover)]"
          >
            Register beta interest
            <ArrowRight className="size-4" />
          </a>
        </div>
      </section>
    </div>
  );
}
