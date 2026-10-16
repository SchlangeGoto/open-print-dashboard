"use client";

import { cn } from "@/lib/utils";

interface Props {
  remaining: number;
  total: number;
  color: string;
  size?: number;
  className?: string;
}

export function SpoolIndicator({ remaining, total, color, size = 120, className }: Props) {
  const pct = Math.max(0, Math.min(1, remaining / (total || 1)));
  const outerR = size / 2 - 4;
  const hubR = size * 0.18;
  const filamentR = hubR + (outerR - hubR - 6) * pct;
  const lowStock = pct < 0.15;

  return (
    <div className={cn("relative inline-flex", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <radialGradient id={`spool-fill-${color.replace("#","")}`} cx="40%" cy="35%" r="65%">
            <stop offset="0%" stopColor={color} stopOpacity="0.95" />
            <stop offset="100%" stopColor={color} stopOpacity="0.55" />
          </radialGradient>
          <radialGradient id={`spool-body-${color.replace("#","")}`} cx="50%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#2a2a32" />
            <stop offset="100%" stopColor="#111116" />
          </radialGradient>
        </defs>

        {/* outer flange */}
        <circle
          cx={size / 2} cy={size / 2} r={outerR}
          fill={`url(#spool-body-${color.replace("#","")})`}
          stroke="#2a2a32"
          strokeWidth="1.5"
        />

        {/* filament wound — smooth CSS transition only */}
        <circle
          cx={size / 2} cy={size / 2}
          r={filamentR}
          fill={`url(#spool-fill-${color.replace("#","")})`}
          stroke={color}
          strokeWidth="0.5"
          style={{ transition: "r 1s cubic-bezier(0.22,1,0.36,1)" }}
        />

        {/* hub body */}
        <circle cx={size / 2} cy={size / 2} r={hubR} fill="#0e0e12" stroke="#2a2a32" strokeWidth="1.2" />
        {/* hub inner ring */}
        <circle cx={size / 2} cy={size / 2} r={hubR * 0.5} fill="#1a1a20" stroke="#222228" strokeWidth="0.8" />
        {/* center bolt */}
        <circle cx={size / 2} cy={size / 2} r={hubR * 0.18} fill="#2a2a32" />

        {/* spoke marks */}
        {Array.from({ length: 6 }).map((_, i) => {
          const a = (i / 6) * Math.PI * 2 - Math.PI / 6;
          const x1 = size / 2 + Math.cos(a) * hubR * 0.55;
          const y1 = size / 2 + Math.sin(a) * hubR * 0.55;
          const x2 = size / 2 + Math.cos(a) * hubR * 0.9;
          const y2 = size / 2 + Math.sin(a) * hubR * 0.9;
          return (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="#2a2a35" strokeWidth="1.5" strokeLinecap="round" />
          );
        })}
      </svg>
      {lowStock && (
        <span className="absolute -top-1 -right-1 rounded-sm bg-red-500/90 text-white text-[8px] font-bold uppercase tracking-wider px-1 py-0.5 animate-pulse">
          LOW
        </span>
      )}
    </div>
  );
}