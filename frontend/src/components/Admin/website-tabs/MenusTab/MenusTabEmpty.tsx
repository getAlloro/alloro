import { Menu as MenuIcon } from "lucide-react";

/* ─── Main: Empty state ─── */
export function MenusTabEmpty() {
  return (
    <div className="flex items-center justify-center h-full text-gray-500">
      <div className="text-center">
        <MenuIcon className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">Select a menu or create one to get started</p>
      </div>
    </div>
  );
}
