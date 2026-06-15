import type {
  fetchMenus as defaultFetchMenus,
  fetchMenu as defaultFetchMenu,
  createMenu as defaultCreateMenu,
  updateMenu as defaultUpdateMenu,
  deleteMenu as defaultDeleteMenu,
  createMenuItem as defaultCreateMenuItem,
  updateMenuItem as defaultUpdateMenuItem,
  deleteMenuItem as defaultDeleteMenuItem,
  reorderMenuItems as defaultReorderMenuItems,
} from "../../../api/menus";
import type { MenuItem } from "../../../api/menus";
import type {
  fetchPosts as defaultFetchPosts,
  fetchPostTypes as defaultFetchPostTypes,
} from "../../../api/posts";

export interface MenusTabProps {
  projectId: string;
  templateId?: string | null;
  borderless?: boolean;
  // Optional API overrides for user-facing context
  fetchMenusFn?: typeof defaultFetchMenus;
  fetchMenuFn?: typeof defaultFetchMenu;
  createMenuFn?: typeof defaultCreateMenu;
  updateMenuFn?: typeof defaultUpdateMenu;
  deleteMenuFn?: typeof defaultDeleteMenu;
  createMenuItemFn?: typeof defaultCreateMenuItem;
  updateMenuItemFn?: typeof defaultUpdateMenuItem;
  deleteMenuItemFn?: typeof defaultDeleteMenuItem;
  reorderMenuItemsFn?: typeof defaultReorderMenuItems;
  fetchPostsFn?: typeof defaultFetchPosts;
  fetchPostTypesFn?: typeof defaultFetchPostTypes;
}

/** Flat representation of a menu item for DnD */
export interface FlatItem {
  id: string;
  parentId: string | null;
  depth: number;
  item: MenuItem;
}
