import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, Loader2, Search } from "lucide-react";

interface PropertyItem {
  id: string;
  name: string;
  account?: string;
  permissionLevel?: string;
  address?: string; // For GBP
  // Helper for GBP
  accountId?: string;
  locationId?: string;
}

interface PropertySelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  items: PropertyItem[];
  onSelect: (item: PropertyItem) => void; // For single select
  onMultiSelect?: (items: PropertyItem[]) => void; // For multi select
  isLoading?: boolean; // Loading available items
  isSaving?: boolean; // Saving selection
  type: "gbp";
  initialSelections?: string[]; // IDs of currently connected properties
  multiSelect?: boolean;
}

export const PropertySelectionModal: React.FC<PropertySelectionModalProps> = ({
  isOpen,
  onClose,
  title,
  items,
  onSelect,
  onMultiSelect,
  isLoading,
  isSaving,
  type: _type,
  initialSelections = [],
  multiSelect = false,
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  // Stabilize initialSelections reference to prevent infinite re-render loop
  // when callers pass a new [] literal on every render
  const stableInitialSelections = useMemo(
    () => initialSelections,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(initialSelections)]
  );

  // Sync initial selections when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedIds(stableInitialSelections);
      setSearchQuery("");
    }
  }, [isOpen, stableInitialSelections]);

  const handleItemClick = (item: PropertyItem) => {
    if (isSaving) return;

    if (multiSelect) {
      setSelectedIds((prev) => {
        if (prev.includes(item.id)) {
          return prev.filter((id) => id !== item.id);
        } else {
          return [...prev, item.id];
        }
      });
    } else {
      // Single select - just update state
      setSelectedIds([item.id]);
    }
  };

  const handleConfirm = () => {
    const selectedItems = items.filter((item) => selectedIds.includes(item.id));

    if (multiSelect && onMultiSelect) {
      onMultiSelect(selectedItems);
    } else if (!multiSelect && onSelect && selectedItems.length > 0) {
      onSelect(selectedItems[0]);
    }
  };

  // Filter items based on search
  const filteredItems = items.filter(
    (item) =>
      item.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.address?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.account?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-alloro-navy/50 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", duration: 0.3 }}
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh]"
          >
            {/* Header */}
            <div className="p-6 border-b border-slate-200 flex justify-between items-center">
              <h3 className="font-display text-lg font-medium text-alloro-navy tracking-tight">
                {title}
              </h3>
              <button
                onClick={onClose}
                disabled={isSaving}
                className="p-2 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            {/* Search */}
            {!isLoading && items.length > 0 && (
              <div className="px-6 py-3 border-b border-slate-100">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search properties..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-alloro-orange/20 focus:border-alloro-orange outline-none transition-all"
                  />
                </div>
              </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-3">
              {isLoading ? (
                <div className="flex flex-col justify-center items-center h-40 gap-3">
                  <Loader2 className="w-8 h-8 text-alloro-orange animate-spin" />
                  <p className="text-sm text-slate-500 font-medium">
                    Loading properties...
                  </p>
                </div>
              ) : items.length === 0 ? (
                <div className="text-center py-12 px-6">
                  <div className="p-3 bg-slate-100 rounded-xl w-fit mx-auto mb-3">
                    <Search className="w-8 h-8 text-slate-400" />
                  </div>
                  <p className="text-alloro-navy font-bold">
                    No properties found
                  </p>
                  <p className="text-sm text-slate-500 mt-1">
                    Make sure you have access to the correct Google account.
                  </p>
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="text-center py-12 px-6">
                  <p className="text-slate-500">
                    No properties match your search
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredItems.map((item) => {
                    const isSelected = selectedIds.includes(item.id);
                    return (
                      <button
                        key={item.id}
                        onClick={() => handleItemClick(item)}
                        disabled={isSaving}
                        className={`w-full text-left p-4 rounded-xl transition-all group flex items-center justify-between border ${
                          isSelected
                            ? "bg-alloro-orange/5 border-alloro-orange/30 ring-1 ring-alloro-orange/20"
                            : "bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-300"
                        }`}
                      >
                        <div className="flex-1 min-w-0 mr-4">
                          <div
                            className={`font-bold truncate ${
                              isSelected
                                ? "text-alloro-orange"
                                : "text-alloro-navy"
                            }`}
                          >
                            {item.name || item.id}
                          </div>
                          <div
                            className={`text-xs mt-0.5 truncate font-medium ${
                              isSelected
                                ? "text-alloro-orange/70"
                                : "text-slate-500"
                            }`}
                          >
                            {item.address}
                          </div>
                        </div>
                        <div className="shrink-0">
                          {isSaving && !multiSelect && isSelected ? (
                            <Loader2 className="w-5 h-5 text-alloro-orange animate-spin" />
                          ) : (
                            <div
                              className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-colors ${
                                isSelected
                                  ? "bg-alloro-orange border-alloro-orange"
                                  : "border-slate-300 group-hover:border-slate-400"
                              }`}
                            >
                              {isSelected && (
                                <Check className="w-4 h-4 text-white" />
                              )}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer - Always show if items exist */}
            {items.length > 0 && (
              <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-between items-center gap-3">
                <span className="text-sm text-slate-500 font-medium">
                  {selectedIds.length} selected
                </span>
                <div className="flex gap-3">
                  <button
                    onClick={onClose}
                    disabled={isSaving}
                    className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirm}
                    disabled={isSaving || selectedIds.length === 0}
                    className="px-5 py-2.5 text-sm font-bold text-white bg-alloro-orange hover:bg-blue-700 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-md"
                  >
                    {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                    Confirm Selection
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
