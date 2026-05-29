import type { GbpReplyOpsMetrics } from "../../../api/gbpAutomation";

export type GbpClientReplyOpsCardsProps = {
  replyOps: GbpReplyOpsMetrics;
};

export function GbpClientReplyOpsCards({ replyOps }: GbpClientReplyOpsCardsProps) {
  const cards: Array<{ label: string; value: string; valueClass: string }> = [
    {
      label: "Waiting 7d+",
      value: replyOps.unrepliedOver7d.toLocaleString(),
      valueClass: "text-alloro-navy",
    },
    {
      label: "Waiting 30d+",
      value: replyOps.unrepliedOver30d.toLocaleString(),
      valueClass: "text-alloro-orange",
    },
    {
      label: "Coverage",
      value: `${replyOps.replyCoveragePercent}%`,
      valueClass: "text-alloro-navy",
    },
  ];

  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {cards.map((card) => (
        <div key={card.label} className="rounded-[10px] border border-slate-200 bg-white px-3 py-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            {card.label}
          </p>
          <p className={`mt-1 text-lg font-black ${card.valueClass}`}>
            {card.value}
          </p>
        </div>
      ))}
    </div>
  );
}
