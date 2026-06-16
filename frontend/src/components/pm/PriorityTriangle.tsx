const COLORS: Record<string, string> = {
  P1: "#C43333",
  P2: "#C45A46",
  P3: "#D4920A",
  P4: "#3D8B40",
  P5: "#5E8B5E",
};

const LABELS: Record<string, string> = {
  P1: "Top of the hour",
  P2: "Today",
  P3: "3 days",
  P4: "This week",
  P5: "Next week",
};

interface PriorityTriangleProps {
  priority: "P1" | "P2" | "P3" | "P4" | "P5" | null;
  size?: number;
  showLabel?: boolean;
}

export function PriorityTriangle({ priority, size = 12, showLabel = false }: PriorityTriangleProps) {
  if (!priority) return null;
  const color = COLORS[priority] || COLORS.P3;
  const label = LABELS[priority] || priority;

  return (
    <span className="inline-flex items-center gap-1">
      <svg width={size} height={size} viewBox="0 0 12 12" fill="none">
        <path d="M6 1L11 10H1L6 1Z" fill={color} />
      </svg>
      {showLabel && (
        <span className="text-[10px] font-semibold" style={{ color }}>
          {label}
        </span>
      )}
    </span>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export { LABELS as PRIORITY_LABELS };
