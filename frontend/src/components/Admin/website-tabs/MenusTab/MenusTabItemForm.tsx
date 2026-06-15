import { motion, AnimatePresence } from "framer-motion";
import { Save, X } from "lucide-react";
import type { MenuItem } from "../../../../api/menus";
import AnimatedSelect from "../../../ui/AnimatedSelect";
import { ActionButton } from "../../../ui/DesignSystem";

interface SelectOption {
  value: string;
  label: string;
}

interface MenusTabItemFormProps {
  showItemForm: boolean;
  editingItem: MenuItem | null;
  resetItemForm: () => void;
  itemLabel: string;
  setItemLabel: (value: string) => void;
  itemUrl: string;
  setItemUrl: (value: string) => void;
  targetOptions: SelectOption[];
  itemTarget: string;
  setItemTarget: (value: string) => void;
  parentOptions: SelectOption[];
  itemParentId: string | null;
  setItemParentId: (value: string | null) => void;
  handleSaveItem: () => void;
  savingItem: boolean;
}

/* ─── Add/edit item form ─── */
export function MenusTabItemForm({
  showItemForm,
  editingItem,
  resetItemForm,
  itemLabel,
  setItemLabel,
  itemUrl,
  setItemUrl,
  targetOptions,
  itemTarget,
  setItemTarget,
  parentOptions,
  itemParentId,
  setItemParentId,
  handleSaveItem,
  savingItem,
}: MenusTabItemFormProps) {
  return (
    <AnimatePresence>
      {showItemForm && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="border-t border-gray-200 bg-gray-50/50"
        >
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-700">
                {editingItem ? "Edit Item" : "Add Item"}
              </h4>
              <button onClick={resetItemForm} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Label</label>
                <input
                  type="text"
                  value={itemLabel}
                  onChange={(e) => setItemLabel(e.target.value)}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                  placeholder="Home"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">URL</label>
                <input
                  type="text"
                  value={itemUrl}
                  onChange={(e) => setItemUrl(e.target.value)}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                  placeholder="/"
                />
              </div>
              <div>
                <AnimatedSelect
                  label="Opens in"
                  options={targetOptions}
                  value={itemTarget}
                  onChange={setItemTarget}
                  size="sm"
                />
              </div>
              <div>
                <AnimatedSelect
                  label="Parent"
                  options={parentOptions}
                  value={itemParentId || "__none__"}
                  onChange={(val) => setItemParentId(val === "__none__" ? null : val)}
                  size="sm"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <ActionButton
                onClick={handleSaveItem}
                disabled={savingItem || !itemLabel.trim() || !itemUrl.trim()}
                loading={savingItem}
                icon={<Save className="w-3.5 h-3.5" />}
                label={editingItem ? "Update" : "Add"}
              />
              <button
                onClick={resetItemForm}
                className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
