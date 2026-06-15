import { Check } from "lucide-react";

export default function WizardSteps({
  current,
  steps,
}: {
  current: 1 | 2 | 3;
  steps: { id: 1 | 2 | 3; label: string; icon: React.ReactNode }[];
}) {
  return (
    <div className="flex items-center justify-between px-1">
      {steps.map((s, idx) => {
        const done = current > s.id;
        const active = current === s.id;
        return (
          <div key={s.id} className="flex items-center flex-1 last:flex-none">
            <div className="flex items-center gap-2">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold transition ${
                  done
                    ? "bg-alloro-orange text-white"
                    : active
                      ? "bg-alloro-orange/10 text-alloro-orange ring-2 ring-alloro-orange"
                      : "bg-gray-100 text-gray-400"
                }`}
              >
                {done ? <Check className="w-3.5 h-3.5" /> : s.id}
              </div>
              <span
                className={`text-xs font-medium ${
                  active
                    ? "text-gray-900"
                    : done
                      ? "text-gray-600"
                      : "text-gray-400"
                }`}
              >
                {s.label}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <div
                className={`flex-1 h-px mx-3 transition ${
                  done ? "bg-alloro-orange" : "bg-gray-200"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
