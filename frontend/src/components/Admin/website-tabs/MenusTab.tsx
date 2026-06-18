import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import type { DropResult, DragStart } from "@hello-pangea/dnd";
import {
  Plus,
  Trash2,
  Pencil,
  Loader2,
  Menu as MenuIcon,
  Save,
  GripVertical,
  ExternalLink,
  CornerDownRight,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";
import {
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
import type { Menu, MenuWithItems, MenuItem } from "../../../api/menus";
import { fetchPosts as defaultFetchPosts } from "../../../api/posts";
import { fetchPostTypes as defaultFetchPostTypes } from "../../../api/posts";
import type { Post, PostType } from "../../../api/posts";
import { ActionButton } from "../../ui/DesignSystem";
import { useConfirm } from "../../ui/ConfirmModal";
import { logger } from "../../../lib/logger";
import type { FlatItem, MenusTabProps } from "./menusTab.types";
import { INDENT_PX, flattenTree, countDescendants, rebuildHierarchy } from "./menusTab.utils";
import { MenusTabSidebar } from "./MenusTab/MenusTabSidebar";
import { MenusTabMenuForm } from "./MenusTab/MenusTabMenuForm";
import { MenusTabItemForm } from "./MenusTab/MenusTabItemForm";
import { MenusTabPostPicker } from "./MenusTab/MenusTabPostPicker";
import { MenusTabEmpty } from "./MenusTab/MenusTabEmpty";

export default function MenusTab({
  projectId,
  templateId,
  borderless = false,
  fetchMenusFn = defaultFetchMenus,
  fetchMenuFn = defaultFetchMenu,
  createMenuFn = defaultCreateMenu,
  updateMenuFn = defaultUpdateMenu,
  deleteMenuFn = defaultDeleteMenu,
  createMenuItemFn = defaultCreateMenuItem,
  updateMenuItemFn = defaultUpdateMenuItem,
  deleteMenuItemFn = defaultDeleteMenuItem,
  reorderMenuItemsFn = defaultReorderMenuItems,
  fetchPostsFn = defaultFetchPosts,
  fetchPostTypesFn = defaultFetchPostTypes,
}: MenusTabProps) {
  const confirm = useConfirm();

  const [menus, setMenus] = useState<Menu[]>([]);
  const [selectedMenuId, setSelectedMenuId] = useState<string | null>(null);
  const [activeMenu, setActiveMenu] = useState<MenuWithItems | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuLoading, setMenuLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Local DnD state — changes here don't hit the API until "Save Order"
  const [localFlatItems, setLocalFlatItems] = useState<FlatItem[]>([]);
  const [hasUnsavedOrder, setHasUnsavedOrder] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);

  // Drag depth tracking — horizontal mouse movement → indent/outdent
  const dragStartXRef = useRef(0);
  const depthDeltaRef = useRef(0);
  const isDraggingRef = useRef(false);
  const draggingIndexRef = useRef(-1);
  const [depthPreview, setDepthPreview] = useState(0); // live visual feedback

  // Menu create/edit
  const [showMenuForm, setShowMenuForm] = useState(false);
  const [editingMenu, setEditingMenu] = useState<Menu | null>(null);
  const [menuName, setMenuName] = useState("");
  const [menuSlug, setMenuSlug] = useState("");
  const [savingMenu, setSavingMenu] = useState(false);

  // Item create/edit
  const [showItemForm, setShowItemForm] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [itemLabel, setItemLabel] = useState("");
  const [itemUrl, setItemUrl] = useState("");
  const [itemTarget, setItemTarget] = useState("_self");
  const [itemParentId, setItemParentId] = useState<string | null>(null);
  const [savingItem, setSavingItem] = useState(false);

  // Post picker state
  const [showPostPicker, setShowPostPicker] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [postTypes, setPostTypes] = useState<PostType[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [addingPostId, setAddingPostId] = useState<string | null>(null);

  // Track mouse X during drag for indent/outdent
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const deltaX = e.clientX - dragStartXRef.current;
      depthDeltaRef.current = Math.round(deltaX / INDENT_PX);
      setDepthPreview(depthDeltaRef.current);
    };
    document.addEventListener("mousemove", handleMouseMove);
    return () => document.removeEventListener("mousemove", handleMouseMove);
  }, []);

  const loadMenus = useCallback(async () => {
    try {
      setError(null);
      const res = await fetchMenusFn(projectId);
      setMenus(res.data);
      // Auto-select first menu if none selected
      if (!selectedMenuId && res.data.length > 0) {
        setSelectedMenuId(res.data[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load menus");
    } finally {
      setLoading(false);
    }
  }, [projectId, selectedMenuId]);

  useEffect(() => {
    loadMenus();
  }, [loadMenus]);

  const loadActiveMenu = useCallback(async (menuId: string) => {
    setMenuLoading(true);
    try {
      const res = await fetchMenuFn(projectId, menuId);
      setActiveMenu(res.data);
      setLocalFlatItems(flattenTree(res.data.items));
      setHasUnsavedOrder(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load menu");
    } finally {
      setMenuLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (selectedMenuId) loadActiveMenu(selectedMenuId);
    else {
      setActiveMenu(null);
      setLocalFlatItems([]);
      setHasUnsavedOrder(false);
    }
  }, [selectedMenuId, loadActiveMenu]);

  // --- Save Order ---
  const handleSaveOrder = async () => {
    if (!selectedMenuId || !hasUnsavedOrder) return;
    setSavingOrder(true);
    try {
      const newOrder = rebuildHierarchy(localFlatItems);
      await reorderMenuItemsFn(projectId, selectedMenuId, newOrder);
      await loadActiveMenu(selectedMenuId);
      await loadMenus();
    } catch (err) {
      logger.error("Failed to save order:", err);
      setError(err instanceof Error ? err.message : "Failed to save order");
    } finally {
      setSavingOrder(false);
    }
  };

  // --- Menu CRUD ---
  const resetMenuForm = () => {
    setMenuName("");
    setMenuSlug("");
    setEditingMenu(null);
    setShowMenuForm(false);
  };

  const handleSaveMenu = async () => {
    if (!menuName.trim()) return;
    setSavingMenu(true);
    try {
      if (editingMenu) {
        await updateMenuFn(projectId, editingMenu.id, {
          name: menuName,
          slug: menuSlug || undefined,
        });
      } else {
        const res = await createMenuFn(projectId, {
          name: menuName,
          slug: menuSlug || undefined,
        });
        setSelectedMenuId(res.data.id);
      }
      resetMenuForm();
      await loadMenus();
      if (selectedMenuId) await loadActiveMenu(selectedMenuId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save menu");
    } finally {
      setSavingMenu(false);
    }
  };

  const handleDeleteMenu = async (menu: Menu) => {
    const ok = await confirm({
      title: "Delete Menu",
      message: `Delete "${menu.name}"? All items will be removed.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    await deleteMenuFn(projectId, menu.id);
    if (selectedMenuId === menu.id) {
      setSelectedMenuId(null);
      setActiveMenu(null);
      setLocalFlatItems([]);
      setHasUnsavedOrder(false);
    }
    await loadMenus();
  };

  // --- Item CRUD ---
  const resetItemForm = () => {
    setItemLabel("");
    setItemUrl("");
    setItemTarget("_self");
    setItemParentId(null);
    setEditingItem(null);
    setShowItemForm(false);
  };

  const openItemEditor = (item?: MenuItem) => {
    if (item) {
      setEditingItem(item);
      setItemLabel(item.label);
      setItemUrl(item.url);
      setItemTarget(item.target);
      setItemParentId(item.parent_id);
    } else {
      resetItemForm();
    }
    setShowItemForm(true);
  };

  const handleSaveItem = async () => {
    if (!itemLabel.trim() || !itemUrl.trim() || !selectedMenuId) return;
    setSavingItem(true);
    try {
      if (editingItem) {
        await updateMenuItemFn(projectId, selectedMenuId, editingItem.id, {
          label: itemLabel,
          url: itemUrl,
          target: itemTarget,
          parent_id: itemParentId,
        });
      } else {
        await createMenuItemFn(projectId, selectedMenuId, {
          label: itemLabel,
          url: itemUrl,
          target: itemTarget,
          parent_id: itemParentId,
        });
      }
      resetItemForm();
      await loadActiveMenu(selectedMenuId);
      await loadMenus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save item");
    } finally {
      setSavingItem(false);
    }
  };

  const handleDeleteItem = async (item: MenuItem) => {
    if (!selectedMenuId) return;
    const ok = await confirm({
      title: "Delete Menu Item",
      message: `Delete "${item.label}"?${(item.children?.length || 0) > 0 ? " Children will also be removed." : ""}`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    await deleteMenuItemFn(projectId, selectedMenuId, item.id);
    await loadActiveMenu(selectedMenuId);
    await loadMenus();
  };

  // --- Post Picker ---
  const openPostPicker = async () => {
    if (!templateId) return;
    setShowPostPicker(true);
    setPostsLoading(true);
    try {
      const [postsRes, typesRes] = await Promise.all([
        fetchPostsFn(projectId, { status: "published" }),
        fetchPostTypesFn(templateId),
      ]);
      setPosts(postsRes.data || []);
      setPostTypes(typesRes.data || []);
    } catch (err) {
      logger.error("Failed to load posts:", err);
    } finally {
      setPostsLoading(false);
    }
  };

  const handleAddPost = async (post: Post) => {
    if (!selectedMenuId) return;
    const postType = postTypes.find((pt) => pt.id === post.post_type_id);
    const url = postType ? `/${postType.slug}/${post.slug}` : `/${post.slug}`;
    setAddingPostId(post.id);
    try {
      await createMenuItemFn(projectId, selectedMenuId, {
        label: post.title,
        url,
        target: "_self",
      });
      await loadActiveMenu(selectedMenuId);
      await loadMenus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add post");
    } finally {
      setAddingPostId(null);
    }
  };

  // --- Drag and Drop ---
  const handleDragStart = (start: DragStart) => {
    isDraggingRef.current = true;
    draggingIndexRef.current = start.source.index;
    depthDeltaRef.current = 0;
    setDepthPreview(0);
  };

  const handleDragEnd = (result: DropResult) => {
    const depthDelta = depthDeltaRef.current;
    isDraggingRef.current = false;
    draggingIndexRef.current = -1;
    depthDeltaRef.current = 0;
    setDepthPreview(0);

    if (!result.destination) return;
    const srcIdx = result.source.index;
    const dstIdx = result.destination.index;

    const items = [...localFlatItems];
    const descendantCount = countDescendants(items, srcIdx);

    // Extract the dragged item + its descendants
    const movedBlock = items.splice(srcIdx, 1 + descendantCount);

    // Insert at new position
    const insertAt = dstIdx > srcIdx ? dstIdx - descendantCount : dstIdx;
    items.splice(Math.max(0, insertAt), 0, ...movedBlock);

    // Apply depth delta from horizontal mouse movement
    if (depthDelta !== 0) {
      const movedIdx = Math.max(0, insertAt);
      const movedItem = items[movedIdx];

      // Calculate allowed depth range at the new position
      const minDepth = 0;
      const maxDepth = movedIdx > 0 ? items[movedIdx - 1].depth + 1 : 0;
      const newDepth = Math.max(minDepth, Math.min(maxDepth, movedItem.depth + depthDelta));
      const actualDelta = newDepth - movedItem.depth;

      if (actualDelta !== 0) {
        for (let i = movedIdx; i <= movedIdx + descendantCount; i++) {
          items[i] = { ...items[i], depth: items[i].depth + actualDelta };
        }
      }
    }

    // Only mark dirty if something actually changed
    const changed = srcIdx !== dstIdx || depthDelta !== 0;
    if (changed) {
      setLocalFlatItems(items);
      setHasUnsavedOrder(true);
    }
  };

  // --- Indent / Outdent buttons (precision control) ---
  const handleIndent = (index: number) => {
    if (index === 0) return;
    const current = localFlatItems[index];
    const prev = localFlatItems[index - 1];
    if (prev.depth < current.depth) return;

    const descendantCount = countDescendants(localFlatItems, index);
    const updated = [...localFlatItems];
    for (let i = index; i <= index + descendantCount; i++) {
      updated[i] = { ...updated[i], depth: updated[i].depth + 1 };
    }

    setLocalFlatItems(updated);
    setHasUnsavedOrder(true);
  };

  const handleOutdent = (index: number) => {
    const current = localFlatItems[index];
    if (current.depth === 0) return;

    const descendantCount = countDescendants(localFlatItems, index);
    const updated = [...localFlatItems];
    for (let i = index; i <= index + descendantCount; i++) {
      updated[i] = { ...updated[i], depth: updated[i].depth - 1 };
    }

    setLocalFlatItems(updated);
    setHasUnsavedOrder(true);
  };

  // --- Flatten top-level items for parent selector ---
  const topLevelItems = activeMenu?.items || [];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  /* ─── Main: Menu detail with items ─── */
  const renderMenuDetail = () => {
    if (!activeMenu) return null;

    const targetOptions = [
      { value: "_self", label: "Same tab" },
      { value: "_blank", label: "New tab" },
    ];

    const parentOptions = [
      { value: "__none__", label: "Top level" },
      ...topLevelItems.map((item) => ({ value: item.id, label: item.label })),
    ];

    return (
      <div className="flex flex-col h-full">
        {/* Menu header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-gray-900">{activeMenu.name}</h3>
              <button
                onClick={() => {
                  setEditingMenu(activeMenu);
                  setMenuName(activeMenu.name);
                  setMenuSlug(activeMenu.slug);
                  setShowMenuForm(true);
                }}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              Shortcode: <code className="px-1 py-0.5 bg-gray-100 rounded text-[11px]">{`{{ menu id='${activeMenu.slug}' }}`}</code>
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Save Order button — only visible when dirty */}
            {hasUnsavedOrder && (
              <ActionButton
                label="Save Order"
                icon={<Save className="w-4 h-4" />}
                onClick={handleSaveOrder}
                variant="primary"
                loading={savingOrder}
              />
            )}
            {!showItemForm && !showPostPicker && (
              <>
                <button
                  type="button"
                  onClick={() => openItemEditor()}
                  className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-alloro-orange hover:bg-orange-50 rounded-md transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  Add Item
                </button>
                {templateId && (
                  <button
                    type="button"
                    onClick={openPostPicker}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    Add Post
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Items list */}
        <div className="flex-1 overflow-y-auto">
          {menuLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : localFlatItems.length === 0 && !showItemForm ? (
            <div className="text-center py-12 text-gray-500">
              <MenuIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
              No items yet. Add your first menu item.
            </div>
          ) : (
            <DragDropContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
              <Droppable droppableId="menu-items">
                {(provided) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className="min-h-[60px]"
                  >
                    {localFlatItems.map((fi, index) => {
                      const canIndent =
                        index > 0 && localFlatItems[index - 1].depth >= fi.depth;
                      const canOutdent = fi.depth > 0;
                      const isDragTarget = isDraggingRef.current && draggingIndexRef.current === index;

                      // Live depth preview during drag
                      const previewDepth = isDragTarget
                        ? Math.max(0, fi.depth + depthPreview)
                        : fi.depth;

                      return (
                        <Draggable key={fi.id} draggableId={fi.id} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className={`flex items-center gap-2 px-4 py-2.5 border-b border-gray-50 transition-colors group ${
                                snapshot.isDragging
                                  ? "bg-orange-50 shadow-lg rounded-lg z-50"
                                  : "hover:bg-gray-50"
                              }`}
                              style={{
                                ...provided.draggableProps.style,
                                paddingLeft: snapshot.isDragging
                                  ? `${16 + previewDepth * INDENT_PX}px`
                                  : `${16 + fi.depth * INDENT_PX}px`,
                              }}
                              onPointerDown={(e) => {
                                dragStartXRef.current = e.clientX;
                              }}
                            >
                              {/* Drag handle */}
                              <div
                                {...provided.dragHandleProps}
                                className="cursor-grab active:cursor-grabbing flex-shrink-0"
                              >
                                <GripVertical className="w-3.5 h-3.5 text-gray-300" />
                              </div>

                              {fi.depth > 0 && !snapshot.isDragging && (
                                <CornerDownRight className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                              )}

                              {snapshot.isDragging && previewDepth > 0 && (
                                <CornerDownRight className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />
                              )}

                              <div className="flex-1 min-w-0">
                                <span className="text-sm font-medium text-gray-900">
                                  {fi.item.label}
                                </span>
                                <span className="ml-2 text-xs text-gray-400 truncate">
                                  {fi.item.url}
                                </span>
                                {fi.item.target === "_blank" && (
                                  <ExternalLink className="w-3 h-3 text-gray-400 inline ml-1" />
                                )}
                              </div>

                              {!snapshot.isDragging && (
                                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => handleOutdent(index)}
                                    disabled={!canOutdent}
                                    className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                                    title="Outdent"
                                  >
                                    <ArrowLeft className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleIndent(index)}
                                    disabled={!canIndent}
                                    className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                                    title="Indent"
                                  >
                                    <ArrowRight className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => openItemEditor(fi.item)}
                                    className="p-1 text-gray-400 hover:text-blue-600"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteItem(fi.item)}
                                    className="p-1 text-gray-400 hover:text-red-600"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </Draggable>
                      );
                    })}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          )}

          {/* Add/edit item form */}
          <MenusTabItemForm
            showItemForm={showItemForm}
            editingItem={editingItem}
            resetItemForm={resetItemForm}
            itemLabel={itemLabel}
            setItemLabel={setItemLabel}
            itemUrl={itemUrl}
            setItemUrl={setItemUrl}
            targetOptions={targetOptions}
            itemTarget={itemTarget}
            setItemTarget={setItemTarget}
            parentOptions={parentOptions}
            itemParentId={itemParentId}
            setItemParentId={setItemParentId}
            handleSaveItem={handleSaveItem}
            savingItem={savingItem}
          />
        </div>

        {/* Post Picker */}
        <MenusTabPostPicker
          showPostPicker={showPostPicker}
          setShowPostPicker={setShowPostPicker}
          postsLoading={postsLoading}
          posts={posts}
          postTypes={postTypes}
          addingPostId={addingPostId}
          handleAddPost={handleAddPost}
        />

      </div>
    );
  };

  /* ─── Layout ─── */
  return (
    <div className={`flex bg-white overflow-hidden ${borderless ? "h-full" : "rounded-xl border border-gray-200 shadow-sm"}`} style={borderless ? undefined : { minHeight: 480 }}>
      <div className="w-[30%] min-w-[220px] max-w-[320px] flex-shrink-0 bg-gray-50/50">
        <MenusTabSidebar
          menus={menus}
          selectedMenuId={selectedMenuId}
          resetMenuForm={resetMenuForm}
          setShowMenuForm={setShowMenuForm}
          setSelectedMenuId={setSelectedMenuId}
          resetItemForm={resetItemForm}
          handleDeleteMenu={handleDeleteMenu}
        />
      </div>
      <div className="flex-1 min-w-0">
        <AnimatePresence mode="wait">
          {showMenuForm ? (
            <motion.div key="menu-form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <MenusTabMenuForm
                editingMenu={editingMenu}
                menuName={menuName}
                setMenuName={setMenuName}
                menuSlug={menuSlug}
                setMenuSlug={setMenuSlug}
                error={error}
                handleSaveMenu={handleSaveMenu}
                savingMenu={savingMenu}
                resetMenuForm={resetMenuForm}
              />
            </motion.div>
          ) : selectedMenuId && activeMenu ? (
            <motion.div key="menu-detail" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">
              {renderMenuDetail()}
            </motion.div>
          ) : (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">
              <MenusTabEmpty />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
