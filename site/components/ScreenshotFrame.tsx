"use client";

import Image from "next/image";
import { useEffect, useState, type PointerEvent } from "react";
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "motion/react";

type ScreenshotFrameProps = {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  priority?: boolean;
  className?: string;
  caption?: string;
  tone?: "dark" | "light";
};

const spring = {
  stiffness: 180,
  damping: 24,
  mass: 0.2,
};

export function ScreenshotFrame({
  src,
  alt,
  width = 1600,
  height = 1000,
  priority = false,
  className = "",
  caption,
  tone = "dark",
}: ScreenshotFrameProps) {
  const reduce = useReducedMotion();
  const [canTilt, setCanTilt] = useState(false);
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const smoothX = useSpring(pointerX, spring);
  const smoothY = useSpring(pointerY, spring);
  const transform = useMotionTemplate`rotateX(${smoothY}deg) rotateY(${smoothX}deg)`;

  useEffect(() => {
    const query = window.matchMedia("(min-width: 769px) and (pointer: fine)");

    function update() {
      setCanTilt(query.matches);
    }

    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (reduce || !canTilt || event.pointerType !== "mouse") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    pointerX.set(x * 3);
    pointerY.set(-y * 2.5);
  }

  function onPointerLeave() {
    pointerX.set(0);
    pointerY.set(0);
  }

  return (
    <figure className={className}>
      <div className="screenshot-tilt">
        <motion.div
          className="frame"
          style={reduce || !canTilt ? undefined : { transform }}
          onPointerMove={onPointerMove}
          onPointerLeave={onPointerLeave}
        >
          <Image
            src={src}
            alt={alt}
            width={width}
            height={height}
            priority={priority}
            className="h-auto w-full"
            sizes="(max-width: 768px) 100vw, 1100px"
          />
        </motion.div>
      </div>
      {caption ? (
        <figcaption
          className={
            tone === "light"
              ? "mt-3 text-sm text-[var(--color-light-muted)]"
              : "mt-3 text-sm text-[var(--color-muted-2)]"
          }
        >
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
