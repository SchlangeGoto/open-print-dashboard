import Link from "next/link";
import { Disc3 } from "lucide-react";
import { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface AuthLayoutProps {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthLayout({ title, description, children, footer }: AuthLayoutProps) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <Link
            href="/"
            className="inline-flex size-14 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20"
          >
            <Disc3 className="size-7 text-primary" />
          </Link>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">{title}</h1>
          {description ? (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>

        <Card>
          <CardHeader className="sr-only">
            <CardTitle>{title}</CardTitle>
            {description ? <CardDescription>{description}</CardDescription> : null}
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>

        {footer ? (
          <p className="mt-6 text-center text-sm text-muted-foreground">{footer}</p>
        ) : null}
      </div>
    </main>
  );
}
