export function Slug({
  children,
  color = "#11151C",
}: {
  children: React.ReactNode;
  color?: string;
}) {
  return (
    <span
      className="font-mono-display text-[10px] font-bold uppercase tracking-[0.18em]"
      style={{ color }}
    >
      {children}
    </span>
  );
}
