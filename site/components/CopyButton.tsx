"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyButton({
  value,
  tone = "dark",
}: {
  value: string;
  tone?: "dark" | "light";
}) {
  const [copied, setCopied] = useState(false);
  const toneClass =
    tone === "light"
      ? "border-[var(--color-light-rule)] text-[var(--color-light-muted)] hover:border-[var(--color-light-ink)] hover:text-[var(--color-light-ink)]"
      : "border-[var(--color-rule)] text-[var(--color-muted)] hover:border-[var(--color-rule-strong)] hover:text-[var(--color-ink)]";

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be blocked; the code stays selectable.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-md border px-3 py-2 text-sm transition-colors ${toneClass}`}
      aria-label="Copy commands"
    >
      {copied ? (
        <Check className="size-3.5 text-[var(--color-success)]" />
      ) : (
        <Copy className="size-3.5" />
      )}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
