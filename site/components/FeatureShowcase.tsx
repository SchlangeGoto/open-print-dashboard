/* eslint-disable @next/next/no-img-element -- static export serves pre-generated srcset variants */
"use client";

import {
  BarChart3,
  History,
  Package,
  Palette,
  Printer,
  Smartphone,
} from "lucide-react";
import {
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
} from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { imageSrcSet } from "@/lib/images";

const features = [
  {
    icon: Printer,
    title: "Live printer status",
    body: "Nozzle, bed, progress, layers, time left, fan and speed.",
    image: "/screenshots/printers.jpg",
    alt: "OpenPrintDash printers page with live printer cards",
  },
  {
    icon: History,
    title: "Print history",
    body: "Every job with its file, weight, duration and outcome.",
    image: "/screenshots/print-jobs.jpg",
    alt: "OpenPrintDash print history with jobs, weight, duration and status",
  },
  {
    icon: Palette,
    title: "Filament library",
    body: "Brand, material, colour, temperatures and stock.",
    image: "/screenshots/filaments.jpg",
    alt: "OpenPrintDash filament library with brand, material, colour and temperatures",
  },
  {
    icon: Package,
    title: "Spool inventory",
    body: "Remaining weight, price per kilogram and loaded printer.",
    image: "/screenshots/spools.jpg",
    alt: "OpenPrintDash spool inventory with remaining weight, price and loaded printer",
  },
  {
    icon: BarChart3,
    title: "Analytics",
    body: "Success rate, material use and material cost per print.",
    image: "/screenshots/analytics.jpg",
    alt: "OpenPrintDash analytics with success rate, material use and cost",
  },
  {
    icon: Smartphone,
    title: "Native scanner",
    body: "Scan a Bambu box with the iOS or Android companion app.",
    image: "/screenshots/app-scan-crop.jpg",
    alt: "Open Print mobile scanner framing a Bambu filament box barcode",
  },
];

export function FeatureShowcase() {
  const [active, setActive] = useState(0);
  const [phase, setPhase] = useState<"tour" | "done">("tour");
  const [visited, setVisited] = useState<Set<number>>(() => new Set([0]));
  // Keep past slides for the fade and mount the neighbours ahead of time so
  // a tab jump does not show a blank frame while the new image decodes.
  const mounted = new Set(visited);
  for (let index = Math.max(0, active - 1); index <= Math.min(4, active + 1); index++) {
    mounted.add(index);
  }
  if (active >= 4) {
    mounted.add(5);
  }
  const sectionRef = useRef<HTMLDivElement>(null);
  const previousHeight = useRef<number | null>(null);
  const scrollBefore = useRef(0);
  const reduce = useReducedMotion();
  const feature = features[active];

  function warmSlide(index: number) {
    setVisited((current) =>
      current.has(index) ? current : new Set(current).add(index),
    );
  }

  useEffect(() => {
    // The scanner slide is a common jump target; load it once the section
    // has settled so the fade never starts with an empty frame.
    const timer = window.setTimeout(() => warmSlide(5), 2000);
    return () => window.clearTimeout(timer);
  }, []);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });

  useMotionValueEvent(scrollYProgress, "change", (value) => {
    if (phase !== "tour") return;
    if (!window.matchMedia("(min-width: 1024px)").matches) return;
    const next = Math.min(
      features.length - 1,
      Math.max(0, Math.floor(value * features.length)),
    );
    setActive(next);
  });

  useEffect(() => {
    if (phase !== "tour") return;
    if (!window.matchMedia("(min-width: 1024px)").matches) return;
    const next = Math.min(
      features.length - 1,
      Math.max(0, Math.floor(scrollYProgress.get() * features.length)),
    );
    setActive(next);
  }, [phase, scrollYProgress]);

  useEffect(() => {
    if (visited.has(active)) return;
    setVisited((current) => new Set(current).add(active));
  }, [active, visited]);

  useEffect(() => {
    if (phase !== "tour") return;

    function onScroll() {
      const element = sectionRef.current;
      if (!element) return;
      if (element.getBoundingClientRect().bottom < 0) {
        previousHeight.current = element.offsetHeight;
        scrollBefore.current = window.scrollY;
        setPhase("done");
      }
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [phase]);

  useLayoutEffect(() => {
    if (phase !== "done" || previousHeight.current == null) return;
    const element = sectionRef.current;
    if (!element) return;

    const nextHeight = element.offsetHeight;
    const delta = previousHeight.current - nextHeight;
    previousHeight.current = null;

    if (delta > 0) {
      window.scrollTo({
        top: Math.max(0, scrollBefore.current - delta),
        behavior: "instant",
      });
    }
  }, [phase]);

  function selectFeature(index: number) {
    setActive(index);
    if (phase === "done") return;
    if (
      !sectionRef.current ||
      !window.matchMedia("(min-width: 1024px)").matches
    ) {
      return;
    }

    const rect = sectionRef.current.getBoundingClientRect();
    const top = window.scrollY + rect.top;
    const total = sectionRef.current.offsetHeight - window.innerHeight;
    const target = top + total * ((index + 0.5) / features.length);
    window.scrollTo({
      top: target,
      behavior: reduce ? "auto" : "smooth",
    });
  }

  return (
    <div
      ref={sectionRef}
      className={`relative mt-12 ${phase === "tour" ? "lg:h-[480vh]" : ""}`}
    >
      <div
        className={
          phase === "tour"
            ? "lg:sticky lg:top-16 lg:flex lg:h-[calc(100svh-4rem)] lg:flex-col lg:py-4"
            : ""
        }
      >
        <div
          className="grid grid-cols-2 gap-x-6 md:grid-cols-3 lg:grid-cols-6"
          role="group"
          aria-label="Choose a feature to preview"
        >
          {features.map((item, index) => {
            const isActive = index === active;
            return (
              <button
                key={item.title}
                type="button"
                aria-pressed={isActive}
                onClick={() => selectFeature(index)}
                onPointerEnter={() => warmSlide(index)}
                onPointerDown={() => warmSlide(index)}
                onFocus={() => {
                  warmSlide(index);
                  setActive(index);
                }}
                className={`relative flex items-center gap-2 border-b border-[var(--color-rule)] py-3 text-left transition-colors ${
                  isActive
                    ? "text-[var(--color-ink)]"
                    : "text-[var(--color-muted-2)]"
                }`}
              >
                <item.icon
                  className={`size-4 shrink-0 transition-colors ${
                    isActive
                      ? "text-[var(--color-accent)]"
                      : "text-[var(--color-muted-2)]"
                  }`}
                  strokeWidth={1.7}
                />
                <span className="text-sm font-medium">{item.title}</span>
                {isActive ? (
                  <motion.span
                    layoutId="feature-underline"
                    className="absolute inset-x-0 -bottom-px h-0.5 bg-[var(--color-accent)]"
                    transition={
                      reduce
                        ? { duration: 0 }
                        : { type: "spring", stiffness: 380, damping: 34 }
                    }
                  />
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="mt-6 lg:mt-4">
          <div
            className={`relative mx-auto aspect-[16/10] w-full overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-rule-strong)] bg-[var(--color-paper-2)] ${
              phase === "tour"
                ? "lg:max-w-[calc(160svh-22.4rem)]"
                : ""
            }`}
          >
            {features.slice(0, 5).map((item, index) => {
              // opacity-0 still downloads the image. Mount a slide when it
              // is first shown and keep it for later fades; the rest stay
              // unmounted until the user reaches them.
              if (!mounted.has(index)) {
                return null;
              }
              return (
                <img
                  key={item.image}
                  src={item.image}
                  srcSet={imageSrcSet(item.image, [1600, 2400], 3200)}
                  alt={index === active ? item.alt : ""}
                  loading="lazy"
                  sizes="(max-width: 1360px) 100vw, 1360px"
                  className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 motion-reduce:transition-none ${
                    index === active ? "opacity-100" : "opacity-0"
                  }`}
                  aria-hidden={index !== active}
                />
              );
            })}

            <div
              className={`absolute inset-0 transition-opacity duration-500 motion-reduce:transition-none ${
                active === 5 ? "opacity-100" : "pointer-events-none opacity-0"
              }`}
              aria-hidden={active !== 5}
            >
              {mounted.has(5) ? (
                <>
                  <img
                    src="/screenshots/app-scan-crop.jpg"
                    srcSet={imageSrcSet(
                      "/screenshots/app-scan-crop.jpg",
                      [390, 585, 780],
                      1170,
                    )}
                    alt={
                      active === 5
                        ? "Open Print mobile scanner framing a Bambu filament box barcode"
                        : ""
                    }
                    loading="lazy"
                    sizes="(max-width: 1360px) 100vw, 1360px"
                    className="absolute inset-0 h-full w-full object-cover lg:hidden"
                  />
                  <div className="absolute inset-0 hidden lg:block">
                    <img
                      src="/screenshots/app-scan-crop.jpg"
                      srcSet={imageSrcSet(
                        "/screenshots/app-scan-crop.jpg",
                        [390, 585, 780],
                        1170,
                      )}
                      alt=""
                      loading="lazy"
                      sizes="(max-width: 1360px) 100vw, 1360px"
                      className="absolute inset-0 h-full w-full scale-105 object-cover opacity-40 blur-sm"
                    />
                    <div className="absolute inset-0 bg-[var(--color-paper)] opacity-55" />
                    <div className="relative flex h-full items-center justify-center p-6">
                      <div className="relative aspect-[1170/2532] h-full overflow-hidden rounded-[1.75rem] border border-[var(--color-rule-strong)] bg-[var(--color-paper)] shadow-[0_30px_70px_-20px_var(--color-paper-deep)]">
                        <img
                          src="/screenshots/app-scan.jpg"
                          srcSet={imageSrcSet(
                            "/screenshots/app-scan.jpg",
                            [390, 585, 780],
                            1170,
                          )}
                          alt={
                            active === 5
                              ? "Open Print mobile scanner framing a Bambu filament box barcode"
                              : ""
                          }
                          loading="lazy"
                          sizes="(max-width: 1360px) 40vw, 540px"
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                      </div>
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
            <p className="max-w-[70ch] text-sm leading-6 text-[var(--color-muted)]">
              {feature.body}
            </p>
            <p className="text-xs text-[var(--color-muted-2)]">
              {feature.title}, demo data.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
