"use client";

import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Printer,
  History,
  Palette,
  Package,
  Settings,
  Disc3,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/printer", label: "Printer", icon: Printer },
  { href: "/dashboard/prints", label: "Print History", icon: History },
  { href: "/dashboard/filaments", label: "Filaments", icon: Palette },
  { href: "/dashboard/spools", label: "Spools", icon: Package },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-card-border bg-card">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-card-border">
        <div className="rounded-lg bg-accent p-2">
          <Disc3 size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-sm font-bold leading-tight">Open Print</h1>
          <p className="text-xs text-muted">Dashboard</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-accent/10 text-accent"
                  : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50",
              )}
            >
              <item.icon size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-card-border px-6 py-4">
        <p className="text-xs text-muted">Open Print Dashboard</p>
        <p className="text-xs text-zinc-600">v0.1.0</p>
      </div>
    </aside>
  );
}