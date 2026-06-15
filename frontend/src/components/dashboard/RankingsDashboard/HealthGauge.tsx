import { motion } from "framer-motion";
import { Delta } from "./Delta";

/**
 * Half-arc gauge — single value /100, optional prev for an inline delta badge
 * shown next to the score. Header label is owned by the consuming card so we
 * don't duplicate "Practice Health" inside + outside the gauge.
 */
export function HealthGauge({
  value,
  prev,
  compact = false,
}: {
  value: number;
  prev?: number | null;
  compact?: boolean;
}) {
  const v = Math.max(0, Math.min(100, value));
  const pathProgress = v / 100;
  const tone = v >= 80 ? "#22c55e" : v >= 60 ? "#D66853" : "#ef4444";
  const delta =
    prev !== null && prev !== undefined ? Math.round(value - prev) : null;
  const width = compact ? 140 : 210;
  const height = compact ? 82 : 124;

  return (
    <div className="flex flex-col items-center text-center">
      <svg width={width} height={height} viewBox="0 0 180 106" className="overflow-visible">
        <path
          d="M 26 90 A 64 64 0 0 1 154 90"
          fill="none"
          stroke="rgba(17,21,28,0.08)"
          strokeWidth="14"
          strokeLinecap="round"
        />
        <motion.path
          d="M 26 90 A 64 64 0 0 1 154 90"
          fill="none"
          stroke={tone}
          strokeWidth="14"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: pathProgress }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
        <text
          x="90"
          y="76"
          textAnchor="middle"
          fontFamily="Spectral, Georgia, serif"
          fontWeight="500"
          fontSize="34"
          fill="#11151C"
          className="tabular-nums"
        >
          {Math.round(v)}
        </text>
        <text
          x="90"
          y="96"
          textAnchor="middle"
          fontFamily="JetBrains Mono"
          fontSize="10"
          letterSpacing="0.16em"
          fill="rgba(17,21,28,0.4)"
        >
          / 100
        </text>
      </svg>
      {delta !== null && (
        <div className="mt-2">
          <Delta delta={delta} />
        </div>
      )}
    </div>
  );
}
