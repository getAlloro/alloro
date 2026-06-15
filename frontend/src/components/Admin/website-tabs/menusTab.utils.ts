import type { MenuItem } from "../../../api/menus";
import type { FlatItem } from "./menusTab.types";

export const INDENT_PX = 24; // pixels per depth level, matches paddingLeft

/** Flatten a nested menu tree into an ordered list with depth info */
export function flattenTree(items: MenuItem[], depth = 0, parentId: string | null = null): FlatItem[] {
  const result: FlatItem[] = [];
  for (const item of items) {
    result.push({ id: item.id, parentId, depth, item });
    if (item.children && item.children.length > 0) {
      result.push(...flattenTree(item.children, depth + 1, item.id));
    }
  }
  return result;
}

/** Count how many descendants (children, grandchildren, etc.) an item has in the flat list */
export function countDescendants(flatItems: FlatItem[], startIndex: number): number {
  const startDepth = flatItems[startIndex].depth;
  let count = 0;
  for (let i = startIndex + 1; i < flatItems.length; i++) {
    if (flatItems[i].depth > startDepth) count++;
    else break;
  }
  return count;
}

/** Rebuild parent_id + order_index from the flat list's position and depth */
export function rebuildHierarchy(flatItems: FlatItem[]): { id: string; parent_id: string | null; order_index: number }[] {
  const result: { id: string; parent_id: string | null; order_index: number }[] = [];
  const orderCounters = new Map<string, number>();

  for (let idx = 0; idx < flatItems.length; idx++) {
    const fi = flatItems[idx];
    let parentId: string | null = null;
    if (fi.depth > 0) {
      for (let i = idx - 1; i >= 0; i--) {
        if (flatItems[i].depth === fi.depth - 1) {
          parentId = flatItems[i].id;
          break;
        }
      }
    }

    const counterKey = parentId || "__root__";
    const orderIndex = orderCounters.get(counterKey) || 0;
    orderCounters.set(counterKey, orderIndex + 1);

    result.push({ id: fi.id, parent_id: parentId, order_index: orderIndex });
  }

  return result;
}
