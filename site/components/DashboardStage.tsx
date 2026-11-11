/* eslint-disable @next/next/no-img-element -- static export serves pre-generated srcset variants */
"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";

import {
  imageMobileVariantWidth,
  imageSrcSet,
  imageVariant,
} from "@/lib/images";
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";

type BackLayer = {
  src: string;
  className: string;
};

type DashboardStageProps = {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  backLayers?: BackLayer[];
  className?: string;
};

const spring = {
  stiffness: 180,
  damping: 24,
  mass: 0.2,
};

const baseSpring = {
  stiffness: 320,
  damping: 32,
  mass: 0.2,
};

export function DashboardStage({
  src,
  alt,
  width = 3200,
  height = 2000,
  backLayers = [],
  className = "",
}: DashboardStageProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const [canTilt, setCanTilt] = useState(false);
  const [showBackLayers, setShowBackLayers] = useState(false);
  const mobileWidth = imageMobileVariantWidth(src);

  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const smoothX = useSpring(pointerX, spring);
  const smoothY = useSpring(pointerY, spring);

  const { scrollYProgress } = useScroll({
    target: stageRef,
    offset: ["start center", "start start"],
  });

  const baseX = useTransform(scrollYProgress, [0, 0.85], [9, 0]);
  const baseY = useTransform(scrollYProgress, [0, 0.85], [-3, 0]);
  const y = useTransform(scrollYProgress, [0, 0.85], [18, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.85], [0.98, 1]);

  const smoothBaseX = useSpring(baseX, baseSpring);
  const smoothBaseY = useSpring(baseY, baseSpring);

  const rotateX = useTransform(
    [smoothBaseX, smoothX],
    ([base, pointer]: number[]) => base + pointer,
  );
  const rotateY = useTransform(
    [smoothBaseY, smoothY],
    ([base, pointer]: number[]) => base + pointer,
  );

  const transform = useMotionTemplate`rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(${y}px) scale(${scale})`;

  useEffect(() => {
    const tiltQuery = window.matchMedia("(min-width: 769px) and (pointer: fine)");
    const layerQuery = window.matchMedia("(min-width: 769px)");

    function updateTilt() {
      setCanTilt(tiltQuery.matches);
    }
    function updateLayers() {
      setShowBackLayers(layerQuery.matches);
    }

    updateTilt();
    updateLayers();
    tiltQuery.addEventListener("change", updateTilt);
    layerQuery.addEventListener("change", updateLayers);

  return () => {
      tiltQuery.removeEventListener("change", updateTilt);
      layerQuery.removeEventListener("change", updateLayers);
    };
  }, []);

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (reduce || !canTilt || event.pointerType !== "mouse") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    pointerX.set(-y * 3);
    pointerY.set(x * 4);
  }

  function onPointerLeave() {
    pointerX.set(0);
    pointerY.set(0);
  }

  return (
    <figure className={className}>
      <div
        className="stage"
        ref={stageRef}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
      >
        <motion.div
          className="stage-inner"
          style={reduce || !canTilt ? undefined : { transform }}
        >
          {showBackLayers
            ? backLayers.map((layer) => (
                <div
                  key={layer.src}
                  className={`stage-layer ${layer.className}`}
                  aria-hidden="true"
                >
                  <img
                    src={layer.src}
                    srcSet={imageSrcSet(layer.src)}
                    alt=""
                    width={width}
                    height={height}
                    loading="lazy"
                    sizes="(max-width: 768px) 0px, 800px"
                    className="h-auto w-full"
                  />
                </div>
              ))
            : null}
          <div className="stage-front frame">
            <picture>
              <source
                media="(max-width: 768px)"
                srcSet={`${imageVariant(src, mobileWidth)} ${mobileWidth}w`}
                sizes="100vw"
              />
              <img
                src={src}
                srcSet={imageSrcSet(src)}
                alt={alt}
                width={width}
                height={height}
                loading="eager"
                fetchPriority="high"
                className="h-auto w-full"
                sizes="(max-width: 768px) 100vw, 1200px"
              />
            </picture>
          </div>
        </motion.div>
      </div>
      <figcaption className="mt-4 text-sm text-[var(--color-muted-2)]">
        The dashboard, demo data.
      </figcaption>
    </figure>
  );
}
