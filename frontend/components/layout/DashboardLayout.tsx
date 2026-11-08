"use client";

import { ReactNode } from "react";

import { AccentSelector } from "./AccentSelector";
import { AppSidebar } from "./AppSidebar";
import { DemoModeMenu } from "./DemoModeMenu";
import { ModeToggle } from "./ModeToggle";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/lib/auth";

export function DashboardLayout({ children }: { children: ReactNode }) {
  const { isLoading, username } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Spinner className="text-primary" />
          <span className="text-sm">Loading...</span>
        </div>
      </div>
    );
  }

  if (!username) return null;

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1 text-muted-foreground" />
          <div className="ml-auto flex items-center gap-1">
            <DemoModeMenu />
            <ModeToggle />
            <AccentSelector />
          </div>
        </header>
        <main className="flex flex-1 flex-col gap-6 p-4 md:p-6">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
