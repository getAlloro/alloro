export const CompactTag = ({ status }: { status: string }) => {
  const styles: Record<string, string> = {
    Marketing: "text-alloro-orange bg-alloro-orange/5 border-alloro-orange/10",
    Doctor: "text-alloro-navy bg-slate-100 border-slate-200",
    Insurance: "text-green-600 bg-green-50 border-green-100",
    digital: "text-alloro-orange bg-alloro-orange/5 border-alloro-orange/10",
    patient: "text-green-600 bg-green-50 border-green-100",
    other: "text-alloro-navy bg-slate-100 border-slate-200",
  };
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border leading-none mt-1 w-fit ${
        styles[status] || styles["Doctor"]
      }`}
    >
      {status}
    </span>
  );
};
