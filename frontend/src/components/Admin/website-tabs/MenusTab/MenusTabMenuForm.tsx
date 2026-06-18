import { motion } from "framer-motion";
import { Save } from "lucide-react";
import type { Menu } from "../../../../api/menus";
import { ActionButton } from "../../../ui/DesignSystem";

interface MenusTabMenuFormProps {
  editingMenu: Menu | null;
  menuName: string;
  setMenuName: (value: string) => void;
  menuSlug: string;
  setMenuSlug: (value: string) => void;
  error: string | null;
  handleSaveMenu: () => void;
  savingMenu: boolean;
  resetMenuForm: () => void;
}

/* ─── Main: Create/Edit Menu Form ─── */
export function MenusTabMenuForm({
  editingMenu,
  menuName,
  setMenuName,
  menuSlug,
  setMenuSlug,
  error,
  handleSaveMenu,
  savingMenu,
  resetMenuForm,
}: MenusTabMenuFormProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-6"
    >
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        {editingMenu ? "Edit Menu" : "New Menu"}
      </h3>
      <div className="space-y-4 max-w-md">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
          <input
            type="text"
            value={menuName}
            onChange={(e) => setMenuName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            placeholder="Primary Navigation"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Slug <span className="text-xs text-gray-400 font-normal">(used in shortcode)</span>
          </label>
          <input
            type="text"
            value={menuSlug}
            onChange={(e) => setMenuSlug(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
            placeholder="auto-generated from name"
          />
          <p className="mt-1.5 text-xs text-gray-400">
            Use in header: <code className="px-1 py-0.5 bg-gray-100 rounded text-[11px]">{`{{ menu id='${menuSlug || "slug"}' }}`}</code>
          </p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-3 pt-1">
          <ActionButton
            onClick={handleSaveMenu}
            disabled={savingMenu || !menuName.trim()}
            loading={savingMenu}
            icon={<Save className="w-4 h-4" />}
            label={editingMenu ? "Update" : "Create"}
          />
          <button
            onClick={resetMenuForm}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
          >
            Cancel
          </button>
        </div>
      </div>
    </motion.div>
  );
}
