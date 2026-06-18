/**
 * Menus API — Admin portal for managing navigation menus
 */

import { adminFetch } from "./index";

const BASE = "/api/admin/websites";

// =====================================================================
// TYPES
// =====================================================================

export interface MenuItem {
  id: string;
  menu_id: string;
  parent_id: string | null;
  label: string;
  url: string;
  target: string;
  order_index: number;
  created_at: string;
  updated_at: string;
  children?: MenuItem[];
}

export interface Menu {
  id: string;
  project_id: string;
  name: string;
  slug: string;
  item_count: number;
  created_at: string;
  updated_at: string;
}

export interface MenuWithItems extends Menu {
  items: MenuItem[];
}

// =====================================================================
// MENUS
// =====================================================================

export async function fetchMenus(projectId: string): Promise<{ success: boolean; data: Menu[] }> {
  const res = await adminFetch(`${BASE}/${projectId}/menus`, { credentials: "include" });
  if (!res.ok) throw new Error((await res.json()).message || "Failed to fetch menus");
  return res.json();
}

export async function fetchMenu(projectId: string, menuId: string): Promise<{ success: boolean; data: MenuWithItems }> {
  const res = await adminFetch(`${BASE}/${projectId}/menus/${menuId}`, { credentials: "include" });
  if (!res.ok) throw new Error((await res.json()).message || "Failed to fetch menu");
  return res.json();
}

export async function createMenu(projectId: string, data: { name: string; slug?: string }): Promise<{ success: boolean; data: MenuWithItems }> {
  const res = await adminFetch(`${BASE}/${projectId}/menus`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.json()).message || "Failed to create menu");
  return res.json();
}

export async function updateMenu(projectId: string, menuId: string, data: { name?: string; slug?: string }): Promise<{ success: boolean; data: Menu }> {
  const res = await adminFetch(`${BASE}/${projectId}/menus/${menuId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.json()).message || "Failed to update menu");
  return res.json();
}

export async function deleteMenu(projectId: string, menuId: string): Promise<{ success: boolean }> {
  const res = await adminFetch(`${BASE}/${projectId}/menus/${menuId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error((await res.json()).message || "Failed to delete menu");
  return res.json();
}

// =====================================================================
// MENU ITEMS
// =====================================================================

export async function createMenuItem(
  projectId: string,
  menuId: string,
  data: { label: string; url: string; target?: string; parent_id?: string | null; order_index?: number }
): Promise<{ success: boolean; data: MenuItem }> {
  const res = await adminFetch(`${BASE}/${projectId}/menus/${menuId}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.json()).message || "Failed to create menu item");
  return res.json();
}

export async function updateMenuItem(
  projectId: string,
  menuId: string,
  itemId: string,
  data: { label?: string; url?: string; target?: string; parent_id?: string | null; order_index?: number }
): Promise<{ success: boolean; data: MenuItem }> {
  const res = await adminFetch(`${BASE}/${projectId}/menus/${menuId}/items/${itemId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.json()).message || "Failed to update menu item");
  return res.json();
}

export async function deleteMenuItem(
  projectId: string,
  menuId: string,
  itemId: string
): Promise<{ success: boolean }> {
  const res = await adminFetch(`${BASE}/${projectId}/menus/${menuId}/items/${itemId}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error((await res.json()).message || "Failed to delete menu item");
  return res.json();
}

export async function reorderMenuItems(
  projectId: string,
  menuId: string,
  items: { id: string; parent_id: string | null; order_index: number }[]
): Promise<{ success: boolean }> {
  const res = await adminFetch(`${BASE}/${projectId}/menus/${menuId}/items/reorder`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ items }),
  });
  if (!res.ok) throw new Error((await res.json()).message || "Failed to reorder items");
  return res.json();
}
