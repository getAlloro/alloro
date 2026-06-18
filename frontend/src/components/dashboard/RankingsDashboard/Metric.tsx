import { Slug } from "./Slug";

export function Metric({
  label,
  value,
  sub,
  adornment,
}: {
  label: string;
  value: string;
  sub?: string;
  adornment?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Slug color="rgba(17,21,28,0.4)">{label}</Slug>
      <div className="flex items-baseline gap-1.5">
        <span className="font-display text-[28px] font-medium tabular-nums leading-none">
          {value}
        </span>
        {adornment}
      </div>
      {sub && (
        <span className="text-[11px] font-semibold text-alloro-navy/45 tabular-nums">
          {sub}
        </span>
      )}
    </div>
  );
}
