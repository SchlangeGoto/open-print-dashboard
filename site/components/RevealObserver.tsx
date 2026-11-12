"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Adds the `js` class only after hydration, then reveals marked sections as
 * they enter the viewport. Re-runs on client-side navigation so new page
 * sections are observed too. Without JS, the content is visible by default.
 */
export function RevealObserver() {
  const pathname = usePathname();

  useEffect(() => {
    const root = document.documentElement;
    const elements = Array.from(
      document.querySelectorAll<HTMLElement>("[data-reveal]"),
    );

    function showAll() {
      for (const element of elements) element.classList.add("is-visible");
    }

    if (!("IntersectionObserver" in window)) {
      showAll();
      return;
    }

    root.classList.add("js");

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.06 },
    );

    for (const element of elements) observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [pathname]);

  return null;
}
