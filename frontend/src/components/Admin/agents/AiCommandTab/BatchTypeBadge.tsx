import type { AiCommandTargets } from "../../../../api/websites";

export function BatchTypeBadge({ targets }: { targets: AiCommandTargets | string }) {
  const parsed = typeof targets === "string" ? JSON.parse(targets) : targets;
  const type = (parsed as { type?: string })?.type || "ai_editor";
  const map: Record<string, { label: string; color: string }> = {
    ai_editor: { label: "AI Editor", color: "bg-alloro-orange/10 text-alloro-orange" },
    ui_checker: { label: "UI Check", color: "bg-purple-50 text-purple-600" },
    link_checker: { label: "Link Check", color: "bg-blue-50 text-blue-600" },
  };
  const badge = map[type] || map.ai_editor;
  return <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${badge.color}`}>{badge.label}</span>;
}
