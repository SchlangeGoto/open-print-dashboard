"use client";

import { useEffect, useState } from "react";
import { Check, Palette } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const STORAGE_KEY = "accent-color";

const ACCENTS = [
  {
    id: "blue",
    label: "Blue",
    color: "oklch(0.62 0.19 259.8)",
    foreground: "oklch(0.985 0 0)",
  },
  {
    id: "violet",
    label: "Violet",
    color: "oklch(0.606 0.25 292.717)",
    foreground: "oklch(0.985 0 0)",
  },
  {
    id: "emerald",
    label: "Emerald",
    color: "oklch(0.596 0.145 163.225)",
    foreground: "oklch(0.985 0 0)",
  },
  {
    id: "rose",
    label: "Rose",
    color: "oklch(0.645 0.246 16.439)",
    foreground: "oklch(0.985 0 0)",
  },
  {
    id: "amber",
    label: "Amber",
    color: "oklch(0.769 0.188 70.08)",
    foreground: "oklch(0.205 0 0)",
  },
  {
    id: "teal",
    label: "Teal",
    color: "oklch(0.6 0.118 184.704)",
    foreground: "oklch(0.985 0 0)",
  },
] as const;

type Accent = (typeof ACCENTS)[number];
type AccentId = Accent["id"];

function applyAccent(accent: Accent) {
  const root = document.documentElement;
  root.style.setProperty("--brand", accent.color);
  root.style.setProperty("--brand-foreground", accent.foreground);
}

export function AccentSelector() {
  const [accent, setAccent] = useState<AccentId>("blue");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const next = ACCENTS.find((item) => item.id === stored) ?? ACCENTS[0];
    setAccent(next.id);
    applyAccent(next);
  }, []);

  function selectAccent(next: Accent) {
    setAccent(next.id);
    applyAccent(next);
    localStorage.setItem(STORAGE_KEY, next.id);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Change accent color"
          />
        }
      >
        <Palette />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Accent color</DropdownMenuLabel>
          {ACCENTS.map((item) => (
            <DropdownMenuItem
              key={item.id}
              onClick={() => selectAccent(item)}
            >
              <span
                className="size-3 rounded-full border border-foreground/10"
                style={{ backgroundColor: item.color }}
              />
              <span>{item.label}</span>
              {accent === item.id ? <Check className="ml-auto" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
