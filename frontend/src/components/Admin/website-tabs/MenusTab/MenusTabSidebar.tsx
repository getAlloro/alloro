import { Plus, Trash2 } from "lucide-react";
import type { Menu } from "../../../../api/menus";

interface MenusTabSidebarProps {
  menus: Menu[];
  selectedMenuId: string | null;
  resetMenuForm: () => void;
  setShowMenuForm: (show: boolean) => void;
  setSelectedMenuId: (id: string | null) => void;
  resetItemForm: () => void;
  handleDeleteMenu: (menu: Menu) => void;
}

/* ─── Sidebar ─── */
export function MenusTabSidebar({
  menus,
  selectedMenuId,
  resetMenuForm,
  setShowMenuForm,
  setSelectedMenuId,
  resetItemForm,
  handleDeleteMenu,
}: MenusTabSidebarProps) {
  return (
    <div className="flex flex-col h-full border-r border-gray-200">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <h3 className="text-sm font-semibold text-gray-900">Menus</h3>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-gray-400">
            {menus.length} menu{menus.length !== 1 ? "s" : ""}
          </span>
          <button
            type="button"
            onClick={() => {
              resetMenuForm();
              setShowMenuForm(true);
            }}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-alloro-orange hover:bg-orange-50 rounded-md transition-colors"
            title="New Menu"
          >
            <Plus className="w-3 h-3" />
            New
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {menus.length === 0 ? (
          <div className="text-center py-8 text-xs text-gray-400">
            No menus yet
          </div>
        ) : (
          menus.map((menu) => {
            const isActive = menu.id === selectedMenuId;
            return (
              <div key={menu.id} className="group">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedMenuId(menu.id);
                    resetMenuForm();
                    resetItemForm();
                  }}
                  className={`w-full text-left px-4 py-2.5 transition-colors border-l-2 ${
                    isActive
                      ? "border-l-alloro-orange bg-orange-50/50"
                      : "border-l-transparent hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium text-gray-900 truncate">{menu.name}</div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteMenu(menu);
                      }}
                      className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-gray-400 font-mono">/{menu.slug}</span>
                    <span className="text-xs text-gray-400">&middot;</span>
                    <span className="text-xs text-gray-500">{menu.item_count} items</span>
                  </div>
                </button>
              </div>
            );
          })
        )}
      </div>

    </div>
  );
}
