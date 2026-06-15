import { Check } from "lucide-react";

export function SelectChip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border transition-all ${
        selected ? "border-alloro-orange/30 bg-alloro-orange/8 text-alloro-orange" : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50"
      }`}>
      {selected && <Check className="w-3 h-3" />}
      {label}
    </button>
  );
}
