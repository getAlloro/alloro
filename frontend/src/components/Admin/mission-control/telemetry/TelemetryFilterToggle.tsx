import { motion, useReducedMotion } from "framer-motion";
import { Check, type LucideIcon } from "lucide-react";

export type TelemetryFilterToggleProps = {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  icon: LucideIcon;
};

export function TelemetryFilterToggle({
  id,
  label,
  checked,
  onChange,
  icon: Icon,
}: TelemetryFilterToggleProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <label
      htmlFor={id}
      className={`group inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border px-2.5 pr-3 text-[11px] font-black uppercase tracking-wider shadow-sm transition-all duration-200 focus-within:ring-2 focus-within:ring-alloro-teal/40 ${
        checked
          ? "border-alloro-teal/40 bg-alloro-teal/10 text-alloro-navy"
          : "border-gray-200 bg-gray-50 text-gray-500 hover:border-alloro-orange/30 hover:bg-white hover:text-alloro-navy"
      }`}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="sr-only"
      />
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-lg transition-colors duration-200 ${
          checked
            ? "bg-alloro-teal/15 text-alloro-teal"
            : "bg-white text-gray-400 group-hover:text-alloro-orange"
        }`}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span>{label}</span>
      <span
        className={`relative h-5 w-9 rounded-full border transition-colors duration-200 ${
          checked
            ? "border-alloro-teal/30 bg-alloro-teal/20"
            : "border-gray-200 bg-white"
        }`}
      >
        <motion.span
          animate={{ x: checked ? 16 : 0 }}
          transition={
            shouldReduceMotion
              ? { duration: 0 }
              : { type: "spring", stiffness: 420, damping: 28 }
          }
          className={`absolute left-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full shadow-sm transition-colors duration-200 ${
            checked ? "bg-alloro-teal text-white" : "bg-gray-300 text-white"
          }`}
        >
          <Check
            className={`h-2.5 w-2.5 transition-opacity duration-200 ${
              checked ? "opacity-100" : "opacity-0"
            }`}
          />
        </motion.span>
      </span>
    </label>
  );
}
