"use client";

import { Building2, Check, ChevronsUpDown } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth";

export function TenantMenu() {
  const { tenants, activeTenantId, switchTenant, demo } = useAuth();
  const { isMobile } = useSidebar();
  const active = tenants.find((tenant) => tenant.id === activeTenantId);

  if (demo || !active || tenants.length < 2) return null;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <SidebarMenuButton
            size="sm"
            className="text-muted-foreground data-open:bg-sidebar-accent"
            render={<DropdownMenuTrigger />}
            tooltip="Switch tenant"
          >
            <Building2 className="size-4" />
            <span className="truncate">{active.name}</span>
            <ChevronsUpDown className="ml-auto size-4" />
          </SidebarMenuButton>
          <DropdownMenuContent
            className="w-(--anchor-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="start"
            sideOffset={4}
          >
            <DropdownMenuLabel className="font-normal text-xs text-muted-foreground">
              Tenants
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {tenants.map((tenant) => (
              <DropdownMenuItem
                key={tenant.id}
                disabled={!tenant.is_active}
                onClick={() => switchTenant(tenant.id)}
              >
                <Building2 />
                <span className="truncate">{tenant.name}</span>
                <span className="ml-auto text-xs capitalize text-muted-foreground">
                  {tenant.role}
                </span>
                {tenant.id === activeTenantId && <Check className="size-4" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
