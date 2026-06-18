import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Check } from "lucide-react";

// Filter Dropdown Component
interface FilterDropdownOption {
  value: string;
  label: string;
}

interface FilterDropdownProps {
  value: string;
  options: FilterDropdownOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  icon?: React.ReactNode;
  label?: string;
}

export const FilterDropdown: React.FC<FilterDropdownProps> = ({
  value,
  options,
  onChange,
  disabled = false,
  placeholder = "Select...",
  icon,
  label,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 flex items-center gap-1">
          {icon}
          {label}
        </span>
      )}
      <div ref={dropdownRef} className="relative">
        <motion.button
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-all hover:border-gray-300 focus:border-alloro-orange focus:outline-none focus:ring-2 focus:ring-alloro-orange/20 disabled:opacity-50 disabled:cursor-not-allowed min-w-[140px] justify-between"
          whileHover={{ scale: disabled ? 1 : 1.01 }}
          whileTap={{ scale: disabled ? 1 : 0.99 }}
        >
          <span className="truncate">{currentOption?.label || placeholder}</span>
          <motion.div
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown className="h-4 w-4 text-gray-400" />
          </motion.div>
        </motion.button>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute top-full left-0 mt-1 z-50 min-w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg max-h-60 overflow-y-auto"
            >
              {options.map((option) => (
                <motion.button
                  key={option.value}
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={`w-full px-3 py-2 text-left text-sm font-medium transition-colors ${
                    option.value === value
                      ? "bg-alloro-orange/10 text-alloro-orange"
                      : "text-gray-700 hover:bg-gray-50"
                  }`}
                  whileHover={{ backgroundColor: option.value === value ? undefined : "rgba(0,0,0,0.03)" }}
                >
                  <div className="flex items-center gap-2">
                    {option.value === value && (
                      <Check className="h-3.5 w-3.5 text-alloro-orange" />
                    )}
                    <span className={option.value === value ? "ml-0" : "ml-5"}>
                      {option.label}
                    </span>
                  </div>
                </motion.button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
