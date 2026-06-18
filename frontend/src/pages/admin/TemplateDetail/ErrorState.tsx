import { motion } from "framer-motion";
import { AlertCircle } from "lucide-react";
import type { NavigateFunction } from "react-router-dom";
import { ActionButton } from "../../../components/ui/DesignSystem";

export function ErrorState({
  error,
  navigate,
}: {
  error: string | null;
  navigate: NavigateFunction;
}) {
  return (
    <motion.div
      className="flex flex-col items-center justify-center py-24 gap-4"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <AlertCircle className="h-12 w-12 text-red-400" />
      <p className="text-lg font-medium text-gray-700">
        {error || "Template not found"}
      </p>
      <ActionButton
        label="Back to Templates"
        onClick={() => navigate("/admin/templates")}
        variant="secondary"
      />
    </motion.div>
  );
}
