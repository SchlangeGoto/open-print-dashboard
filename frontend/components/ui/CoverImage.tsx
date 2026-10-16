"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { API_ROOT } from "@/lib/api";

const API_BASE = API_ROOT;

interface CoverImageProps {
  cover?: string | null;
  alt: string;
  className?: string;
  fit?: "cover" | "contain";
}

export function CoverImage({ cover, alt, className, fit = "cover" }: CoverImageProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!cover) {
      setObjectUrl(null);
      setFailed(false);
      return;
    }

    const coverUrl = cover;
    let revoked = false;
    let nextUrl: string | null = null;

    async function loadCover() {
      try {
        setFailed(false);
        const token = localStorage.getItem("access_token");
        const response = await fetch(`${API_BASE}/printers/cover/${encodeURIComponent(coverUrl)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });

        if (!response.ok) throw new Error("Cover failed to load");
        const blob = await response.blob();
        nextUrl = URL.createObjectURL(blob);
        if (!revoked) setObjectUrl(nextUrl);
      } catch {
        if (!revoked) {
          setObjectUrl(null);
          setFailed(true);
        }
      }
    }

    loadCover();

    return () => {
      revoked = true;
      if (nextUrl) URL.revokeObjectURL(nextUrl);
    };
  }, [cover]);

  if (!cover || failed || !objectUrl) {
    return <div className={cn("bg-zinc-800/60", className)} aria-hidden="true" />;
  }

  return (
    <div
      role="img"
      aria-label={alt}
      className={cn(
        "bg-center bg-no-repeat",
        fit === "contain" ? "bg-contain" : "bg-cover",
        className,
      )}
      style={{ backgroundImage: `url(${objectUrl})` }}
    />
  );
}
