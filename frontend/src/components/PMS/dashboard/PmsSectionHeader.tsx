export type PmsSectionHeaderProps = {
  title: string;
  meta?: string;
};

export function PmsSectionHeader({ title, meta }: PmsSectionHeaderProps) {
  return (
    <div className="flex items-center gap-4 px-1">
      <h3 className="text-[10px] font-black uppercase tracking-[0.32em] text-alloro-navy/70">
        {title}
      </h3>
      <div className="h-px flex-1 bg-line-soft" />
      {meta && (
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[color:var(--color-pm-text-secondary)]">
          {meta}
        </span>
      )}
    </div>
  );
}
