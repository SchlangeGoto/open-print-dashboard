"use client";

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
import { ACCENTS, useAppearance } from "@/lib/appearance";

export function AccentSelector() {
  const { accent, setAccent } = useAppearance();

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
              onClick={() => setAccent(item.id)}
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
