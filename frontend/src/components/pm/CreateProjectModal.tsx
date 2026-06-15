import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { usePmStore } from "../../stores/pmStore";
import { useNavigate } from "react-router-dom";

const PRESET_COLORS = [
  "#D66853", "#E74C3C", "#F5A623", "#4CAF50",
  "#2196F3", "#9C27B0", "#00BCD4", "#FF5722",
  "#607D8B", "#795548",
];

const ICON_NAMES = [
  "Folder", "Briefcase", "Rocket", "Star", "Zap",
  "Heart", "Target", "Flag", "Code", "Globe",
  "Users", "Calendar", "ClipboardList", "Layers", "Box",
  "Coffee", "Music", "Camera", "BookOpen", "Lightbulb",
];

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateProjectModal({ isOpen, onClose }: CreateProjectModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#D66853");
  const [icon, setIcon] = useState("Folder");
  const [deadline, setDeadline] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const createProject = usePmStore((s) => s.createProject);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const project = await createProject({
        name: name.trim(),
        description: description || undefined,
        color,
        icon: icon.toLowerCase(),
        deadline: deadline || undefined,
      });
      onClose();
      navigate(`/admin/pm/${project.id}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setName("");
    setDescription("");
    setColor("#D66853");
    setIcon("Folder");
    setDeadline("");
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl p-6 overflow-y-auto max-h-[90vh]"
            style={{
              backgroundColor: "var(--color-pm-bg-secondary)",
              boxShadow: "0 16px 48px rgba(0,0,0,0.2), 0 4px 12px rgba(0,0,0,0.1)",
              border: "1px solid var(--color-pm-border)",
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <h2
                className="text-[17px] font-semibold"
                style={{ color: "var(--color-pm-text-primary)" }}
              >
                New Project
              </h2>
              <button
                onClick={handleClose}
                className="rounded-lg p-1.5 transition-colors duration-150"
                style={{ color: "var(--color-pm-text-muted)" }}
              >
                <X className="h-5 w-5" strokeWidth={1.5} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Name */}
              <div>
                <label
                  className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.05em]"
                  style={{ color: "var(--color-pm-text-secondary)" }}
                >
                  Project Name *
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Website Redesign"
                  autoFocus
                  className="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none transition-colors duration-150"
                  style={{
                    backgroundColor: "var(--color-pm-bg-primary)",
                    border: "1px solid var(--color-pm-border)",
                    color: "var(--color-pm-text-primary)",
                  }}
                />
              </div>

              {/* Description */}
              <div>
                <label
                  className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.05em]"
                  style={{ color: "var(--color-pm-text-secondary)" }}
                >
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Optional project description"
                  className="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none resize-none transition-colors duration-150"
                  style={{
                    backgroundColor: "var(--color-pm-bg-primary)",
                    border: "1px solid var(--color-pm-border)",
                    color: "var(--color-pm-text-primary)",
                  }}
                />
              </div>

              {/* Color picker */}
              <div>
                <label
                  className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.05em]"
                  style={{ color: "var(--color-pm-text-secondary)" }}
                >
                  Color
                </label>
                <div className="flex flex-wrap gap-2.5">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className="h-8 w-8 rounded-lg transition-all duration-150"
                      style={{
                        backgroundColor: c,
                        transform: color === c ? "scale(1.15)" : undefined,
                        boxShadow: color === c ? `0 0 0 2px var(--color-pm-bg-secondary), 0 0 0 4px ${c}` : undefined,
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Icon picker */}
              <div>
                <label
                  className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.05em]"
                  style={{ color: "var(--color-pm-text-secondary)" }}
                >
                  Icon
                </label>
                <div className="grid grid-cols-10 gap-1.5">
                  {ICON_NAMES.map((iconName) => {
                    const IconComponent = (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>>)[iconName];
                    if (!IconComponent) return null;
                    const isSelected = icon === iconName;
                    return (
                      <button
                        key={iconName}
                        type="button"
                        onClick={() => setIcon(iconName)}
                        className="flex h-9 w-9 items-center justify-center rounded-lg transition-all duration-150"
                        style={{
                          backgroundColor: isSelected ? "var(--color-pm-accent-subtle2)" : "transparent",
                          color: isSelected ? "#D66853" : "var(--color-pm-text-muted)",
                          boxShadow: isSelected ? "inset 0 0 0 1px #D66853" : undefined,
                        }}
                      >
                        <IconComponent className="h-4 w-4" strokeWidth={1.5} />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Deadline */}
              <div>
                <label
                  className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.05em]"
                  style={{ color: "var(--color-pm-text-secondary)" }}
                >
                  Deadline (optional)
                </label>
                <input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none transition-colors duration-150"
                  style={{
                    backgroundColor: "var(--color-pm-bg-primary)",
                    border: "1px solid var(--color-pm-border)",
                    color: "var(--color-pm-text-primary)",
                  }}
                />
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={!name.trim() || isSubmitting}
                className="w-full rounded-lg px-4 py-3 text-sm font-semibold text-white transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: "#D66853",
                  boxShadow: "0 2px 8px rgba(214,104,83,0.3)",
                }}
              >
                {isSubmitting ? "Creating..." : "Create Project"}
              </button>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
