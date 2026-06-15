export function StarIcon({ size = 12, filled = true }: { size?: number; filled?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden>
      <path
        d="M10 1.5l2.6 5.46 6.02.7-4.43 4.18 1.13 5.94L10 14.93 4.68 17.78l1.13-5.94L1.38 7.66l6.02-.7L10 1.5z"
        fill={filled ? "var(--color-amber)" : "rgba(17,21,28,0.18)"}
      />
    </svg>
  );
}
