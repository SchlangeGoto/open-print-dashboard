"use client";

import { ReactNode } from "react";

import { AppSidebar } from "./AppSidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth";

export function DashboardLayout({ children }: { children: ReactNode }) {
  const { isLoading, username } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-muted-foreground">
          <div className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
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
        </header>
        <main className="flex flex-1 flex-col gap-6 p-4 md:p-6">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
