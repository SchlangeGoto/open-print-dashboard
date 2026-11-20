"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart2,
  Building2,
  History,
  LayoutDashboard,
  Package,
  Palette,
  Printer,
  Settings,
  Users,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { SpoolMark } from "@/components/brand/SpoolMark";
import { useAuth } from "@/lib/auth";
import { TenantMenu } from "./TenantMenu";
import { UserMenu } from "./UserMenu";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/printers", label: "Printers", icon: Printer },
  { href: "/dashboard/prints", label: "Print Jobs", icon: History },
  { href: "/dashboard/filaments", label: "Filaments", icon: Palette },
  { href: "/dashboard/spools", label: "Spools", icon: Package },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart2 },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

const adminItems = [
  { href: "/dashboard/members", label: "Members", icon: Users },
];

const platformItems = [
  { href: "/dashboard/tenants", label: "Tenants", icon: Building2 },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { user, tenants, activeTenantId } = useAuth();
  const activeTenant = tenants.find((tenant) => tenant.id === activeTenantId);
  const canManageMembers =
    activeTenant?.role === "owner" || activeTenant?.role === "admin";
  const items = canManageMembers
    ? [
        ...navItems.slice(0, -1),
        ...(user?.is_superuser ? platformItems : []),
        ...adminItems,
        navItems[navItems.length - 1],
      ]
    : navItems;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/dashboard" />}>
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/20">
                <SpoolMark className="size-5!" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">Open Print</span>
                <span className="truncate text-xs text-muted-foreground">
                  {activeTenant?.name ?? "Dashboard"}
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <TenantMenu />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const isActive =
                  item.href === "/dashboard"
                    ? pathname === "/dashboard"
                    : pathname.startsWith(item.href);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      render={<Link href={item.href} />}
                      isActive={isActive}
                      tooltip={item.label}
                    >
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <UserMenu />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
