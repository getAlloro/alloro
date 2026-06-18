import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Loader2, ChevronDown } from "lucide-react";
import type { DropdownOption } from "../actionItemsHub.utils";

// Animated Dropdown Component
interface AnimatedDropdownProps {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  isLoading?: boolean;
  variant?: "category" | "status";
}

export const AnimatedDropdown: React.FC<AnimatedDropdownProps> = ({
  value,
  options,
  onChange,
  disabled = false,
  isLoading = false,
  variant = "status",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentOption = options.find((opt) => opt.value === value);

  // Close dropdown when clicking outside
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

  const getOptionStyles = (option: DropdownOption, isSelected: boolean) => {
    const baseStyles =
      "w-full px-3 py-2 text-left text-xs font-semibold transition-colors";
    if (isSelected) {
      return `${baseStyles} ${option.color || "bg-gray-100 text-gray-900"}`;
    }
    return `${baseStyles} hover:bg-gray-50 text-gray-700`;
  };

  const getTriggerStyles = () => {
    if (variant === "category") {
      return value === "ALLORO"
        ? "border-purple-200 bg-purple-50 text-purple-700"
        : "border-blue-200 bg-blue-50 text-blue-700";
    }
    // Status variant
    switch (value) {
      case "pending":
        return "border-yellow-200 bg-yellow-50 text-yellow-700";
      case "in_progress":
        return "border-blue-200 bg-blue-50 text-blue-700";
      case "complete":
        return "border-green-200 bg-green-50 text-green-700";
      case "archived":
        return "border-gray-200 bg-gray-100 text-gray-500";
      default:
        return "border-gray-200 bg-gray-100 text-gray-700";
    }
  };

  if (isLoading) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
        <Loader2 className="h-3 w-3 animate-spin" />
        Updating...
      </span>
    );
  }

  return (
    <div
      ref={dropdownRef}
      className="relative"
      onClick={(e) => e.stopPropagation()}
    >
      <motion.button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${getTriggerStyles()}`}
        whileHover={{ scale: disabled ? 1 : 1.02 }}
        whileTap={{ scale: disabled ? 1 : 0.98 }}
      >
        {currentOption?.label || value}
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="h-3 w-3" />
        </motion.div>
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 mt-1 z-50 min-w-[120px] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg"
          >
            {options.map((option) => (
              <motion.button
                key={option.value}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={getOptionStyles(option, option.value === value)}
                whileHover={{ backgroundColor: "rgba(0,0,0,0.03)" }}
              >
                <div className="flex items-center gap-2">
                  {option.value === value && (
                    <Check className="h-3 w-3 text-alloro-orange" />
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
  );
};
