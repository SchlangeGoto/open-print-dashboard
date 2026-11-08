"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { cn } from "cn";
import { API_ROOT, authenticatedFetch } from "@/lib/api";

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
  const isLocalCover = Boolean(cover?.startsWith("/"));

  useEffect(() => {
    if (!cover || cover.startsWith("/")) {
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
        const response = await authenticatedFetch(
          `${API_BASE}/printers/cover/${encodeURIComponent(coverUrl)}`,
        );

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

  if (!cover || failed) {
    return <div className={cn("bg-muted", className)} aria-hidden="true" />;
  }

  // Demo mode uses bundled cover images from /public instead of the backend.
  if (isLocalCover) {
    return (
      <div className={cn("relative overflow-hidden bg-muted", className)}>
        <Image
          src={cover}
          alt={alt}
          fill
          unoptimized
          sizes="(max-width: 768px) 33vw, 200px"
          className={fit === "contain" ? "object-contain" : "object-cover"}
          onError={() => setFailed(true)}
        />
      </div>
    );
  }

  if (!objectUrl) {
    return <div className={cn("bg-muted", className)} aria-hidden="true" />;
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
