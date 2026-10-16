import { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  iconColor?: string;
  iconBg?: string;
  trend?: { value: string; positive: boolean };
}

export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconColor = "text-primary",
  iconBg = "bg-primary/10",
  trend,
}: StatCardProps) {
  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-start justify-between">
          <div className={cn("rounded-lg p-2.5", iconBg)}>
            <Icon className={cn("size-[18px]", iconColor)} />
          </div>
          {trend ? (
            <span
              className={cn(
                "text-xs font-medium",
                trend.positive ? "text-emerald-400" : "text-red-400",
              )}
            >
              {trend.positive ? "↑" : "↓"} {trend.value}
            </span>
          ) : null}
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {title}
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
          {subtitle ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
