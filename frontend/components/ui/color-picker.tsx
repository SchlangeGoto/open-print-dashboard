"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "cn";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const PRESET_COLORS = [
  "#ffffff",
  "#e5e7eb",
  "#9ca3af",
  "#4b5563",
  "#1f2937",
  "#000000",
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#eab308",
  "#84cc16",
  "#22c55e",
  "#10b981",
  "#14b8a6",
  "#06b6d4",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#d946ef",
  "#ec4899",
  "#f43f5e",
  "#78350f",
  "#fde68a",
  "#bfdbfe",
  "#c7d2fe",
  "#fbcfe8",
  "#d9f99d",
];

interface ColorPickerProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function ColorPicker({
  id,
  value,
  onChange,
  className,
}: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const normalized = value.toLowerCase();

  function select(color: string) {
    setDraft(color);
    onChange(color);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setDraft(value);
      }}
    >
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            className={cn(
              "w-full justify-start gap-2 font-normal",
              className,
            )}
          />
        }
      >
        <span
          className="size-5 shrink-0 rounded-md border border-foreground/10"
          style={{ backgroundColor: value }}
        />
        <span className="font-mono text-xs">{value.toUpperCase()}</span>
      </PopoverTrigger>
      <PopoverContent className="w-64" align="start">
        <div className="grid grid-cols-7 gap-1.5">
          {PRESET_COLORS.map((color) => {
            const selected = normalized === color;
            return (
              <button
                key={color}
                type="button"
                aria-label={`Use color ${color}`}
                className={cn(
                  "flex size-6 items-center justify-center rounded-md border border-foreground/10 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  selected && "ring-2 ring-ring ring-offset-2 ring-offset-popover",
                )}
                style={{ backgroundColor: color }}
                onClick={() => select(color)}
              >
                {selected ? (
                  <Check className="size-3.5 text-white mix-blend-difference" />
                ) : null}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Hex</span>
          <Input
            value={draft}
            onChange={(event) => {
              const next = event.target.value;
              setDraft(next);
              if (/^#[0-9a-fA-F]{6}$/.test(next)) onChange(next);
            }}
            placeholder="#000000"
            aria-label="Hex color"
            className="h-8 flex-1 font-mono text-xs"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
