"use client";

import { FlaskConical, LogOut, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth";
import { resetDemoData } from "@/lib/demo";

/**
 * Small indicator in the dashboard header while demo mode is active. Lets you
 * reset local demo edits or leave demo mode to see the real login/setup flow.
 */
export function DemoModeMenu() {
  const { demo, exitDemo } = useAuth();

  if (!demo) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            aria-label="Demo mode"
            title="Demo mode — mock data"
          />
        }
      >
        <FlaskConical className="text-violet-400" />
        <span className="hidden sm:inline">Demo data</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Demo mode</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            resetDemoData();
            window.location.reload();
          }}
        >
          <RotateCcw />
          Reset demo data
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exitDemo}>
          <LogOut />
          Exit demo &amp; sign in
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
