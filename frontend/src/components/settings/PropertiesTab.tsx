import React, { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiGet } from "../../api";
import { MapPin, Plus, Star, Trash2, RefreshCw, Pencil } from "lucide-react";
import { PropertySelectionModal, type PropertyItem } from "./PropertySelectionModal";
import { ConfirmModal } from "./ConfirmModal";
import { GoogleConnectButton } from "../GoogleConnectButton";
import { getPriorityItem } from "../../hooks/useLocalStorage";
import { useLocationContext } from "../../contexts/locationContext";
import { useAuth } from "../../hooks/useAuth";
import {
  getLocations,
  deleteLocation,
  createLocation,
  updateLocation,
  updateLocationGBP,
  type Location,
} from "../../api/locations";
import { logger } from "../../lib/logger";

type UserRole = "admin" | "manager" | "viewer";

export const PropertiesTab: React.FC = () => {
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const { refreshLocations } = useLocationContext();
  const { hasGoogleConnection, refreshUserProperties } = useAuth();

  // GBP selection modal
  const [gbpModalOpen, setGbpModalOpen] = useState(false);
  const [availableGBP, setAvailableGBP] = useState<PropertyItem[]>([]);
  const [loadingAvailable, setLoadingAvailable] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [gbpTargetLocationId, setGbpTargetLocationId] = useState<number | null>(null);

  // Add location wizard
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newLocationName, setNewLocationName] = useState("");
  const [addStep, setAddStep] = useState<"name" | "gbp">("name");

  // Delete confirmation
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Inline name editing
  const [editingNameId, setEditingNameId] = useState<number | null>(null);
  const [editingNameValue, setEditingNameValue] = useState("");

  const inFlightRef = useRef(false);

  const loadData = useCallback(async () => {
    // Prevent concurrent fetches — /locations is slow and repeat invocations
    // were stacking hundreds of pending requests when this effect's deps churned.
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      setIsLoading(true);
      const locs = await getLocations();
      setLocations(locs);
    } catch (err) {
      logger.error("Failed to fetch locations:", err);
    } finally {
      setIsLoading(false);
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    const role = getPriorityItem("user_role") as UserRole | null;
    setUserRole(role);
    loadData();
  }, [loadData]);

  const canManageConnections = userRole === "admin";
  const canRenameLocation = userRole === "admin" || userRole === "manager";

  // Fetch available GBP profiles from Google API
  const fetchAvailableGBP = async () => {
    setLoadingAvailable(true);
    setAvailableGBP([]);
    try {
      const data = await apiGet({ path: "/settings/properties/available/gbp" });
      if (data?.success) {
        setAvailableGBP(data.properties);
      }
    } catch (err) {
      logger.error("Failed to fetch available GBP properties:", err);
    } finally {
      setLoadingAvailable(false);
    }
  };

  // ---- Change GBP for existing location ----
  const handleChangeGBP = async (locationId: number) => {
    setGbpTargetLocationId(locationId);
    setGbpModalOpen(true);
    await fetchAvailableGBP();
  };

  const handleGBPSelected = async (item: { accountId?: string; locationId?: string; name: string }) => {
    if (!gbpTargetLocationId) return;
    setIsSaving(true);
    try {
      await updateLocationGBP(gbpTargetLocationId, {
        accountId: item.accountId ?? "",
        locationId: item.locationId ?? "",
        displayName: item.name,
      });
      setGbpModalOpen(false);
      setGbpTargetLocationId(null);
      await loadData();
      await refreshLocations();
    } catch (err) {
      logger.error("Failed to update GBP:", err);
    } finally {
      setIsSaving(false);
    }
  };

  // ---- Add location wizard ----
  const openAddLocation = () => {
    setNewLocationName("");
    setAddStep("name");
    setAddModalOpen(true);
  };

  const handleAddNameSubmit = async () => {
    if (!newLocationName.trim()) return;
    setAddStep("gbp");
    setGbpTargetLocationId(null); // null = creating new
    await fetchAvailableGBP();
  };

  const handleAddGBPSelected = async (item: { accountId?: string; locationId?: string; name: string }) => {
    setIsSaving(true);
    try {
      await createLocation({
        name: newLocationName.trim(),
        gbp: {
          accountId: item.accountId ?? "",
          locationId: item.locationId ?? "",
          displayName: item.name,
        },
      });
      setAddModalOpen(false);
      await loadData();
      await refreshLocations();
    } catch (err) {
      logger.error("Failed to create location:", err);
    } finally {
      setIsSaving(false);
    }
  };

  // ---- Delete location ----
  const initiateDelete = (locationId: number) => {
    setDeleteTargetId(locationId);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTargetId) return;
    setIsDeleting(true);
    try {
      await deleteLocation(deleteTargetId);
      setDeleteConfirmOpen(false);
      setDeleteTargetId(null);
      await loadData();
      await refreshLocations();
    } catch (err) {
      logger.error("Failed to delete location:", err);
    } finally {
      setIsDeleting(false);
    }
  };

  // ---- Set as primary ----
  const handleSetPrimary = async (locationId: number) => {
    try {
      await updateLocation(locationId, { is_primary: true });
      await loadData();
      await refreshLocations();
    } catch (err) {
      logger.error("Failed to set primary:", err);
    }
  };

  // ---- Inline name edit ----
  const startNameEdit = (loc: Location) => {
    setEditingNameId(loc.id);
    setEditingNameValue(loc.name);
  };

  const saveNameEdit = async () => {
    if (!editingNameId || !editingNameValue.trim()) return;
    try {
      await updateLocation(editingNameId, { name: editingNameValue.trim() });
      setEditingNameId(null);
      await loadData();
      await refreshLocations();
    } catch (err) {
      logger.error("Failed to update name:", err);
    }
  };

  // ---- Loading skeleton ----
  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="bg-white rounded-2xl border border-slate-200 shadow-[0_2px_8px_rgba(0,0,0,0.04)] p-5"
          >
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-slate-200 rounded-xl" />
              <div className="flex-1">
                <div className="h-5 w-48 bg-slate-200 rounded mb-2" />
                <div className="h-4 w-64 bg-slate-200 rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-display text-lg font-medium text-alloro-navy tracking-tight">
            Locations
          </h3>
          <p className="text-slate-400 text-[12px] mt-1 font-semibold">
            Manage your business locations and their Google Business Profiles
          </p>
        </div>
        {hasGoogleConnection && (
          <button
            onClick={openAddLocation}
            className="flex shrink-0 items-center gap-2 whitespace-nowrap px-3.5 py-2 text-[10px] font-black uppercase tracking-widest text-white bg-alloro-orange rounded-lg hover:bg-alloro-orange/90 transition-colors shadow-lg active:scale-95"
          >
            <Plus size={14} />
            Add Location
          </button>
        )}
      </div>

      {/* Location Cards */}
      {locations.length === 0 ? (
        <div className="bg-white rounded-[28px] border border-slate-200 shadow-[0_2px_8px_rgba(0,0,0,0.04)] p-12 text-center">
          {!hasGoogleConnection ? (
            <>
              <MapPin className="w-12 h-12 text-alloro-orange/40 mx-auto mb-4" />
              <p className="text-alloro-navy font-semibold text-lg mb-1">Connect your Google Account</p>
              <p className="text-slate-400 text-sm mb-6">
                Link your Google Business Profile to add and manage your locations
              </p>
              <div className="flex justify-center">
                <GoogleConnectButton
                  variant="primary"
                  size="md"
                  onSuccess={async () => {
                    await refreshUserProperties();
                    await loadData();
                  }}
                />
              </div>
            </>
          ) : (
            <>
              <MapPin className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500 font-semibold">No locations configured</p>
              <p className="text-slate-400 text-sm mt-1 mb-6">
                Add your first location to get started
              </p>
              <button
                onClick={openAddLocation}
                className="inline-flex items-center gap-2 whitespace-nowrap px-5 py-2.5 text-[10px] font-black uppercase tracking-widest text-white bg-alloro-orange rounded-xl hover:bg-alloro-orange/90 transition-colors shadow-lg active:scale-95"
              >
                <Plus size={14} />
                Add Location
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {locations.map((loc, index) => {
            const gbpProp = loc.googleProperties?.[0];
            return (
              <motion.div
                key={loc.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="bg-white rounded-[28px] border border-slate-200 shadow-[0_2px_8px_rgba(0,0,0,0.04)] overflow-hidden"
              >
                <div className="p-5">
                  {/* Location Header Row */}
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className="p-3 rounded-2xl bg-green-50 flex-shrink-0">
                        <MapPin className="w-5 h-5 text-green-500" />
                      </div>
                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                        {editingNameId === loc.id ? (
                          <input
                            value={editingNameValue}
                            onChange={(e) =>
                              setEditingNameValue(e.target.value)
                            }
                            onBlur={saveNameEdit}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveNameEdit();
                              if (e.key === "Escape")
                                setEditingNameId(null);
                            }}
                            autoFocus
                            className="font-display text-lg font-medium text-alloro-navy tracking-tight border-b-2 border-alloro-orange outline-none bg-transparent"
                          />
                        ) : (
                          <h4
                            className="font-display text-lg font-medium text-alloro-navy tracking-tight cursor-pointer hover:text-alloro-orange transition-colors group flex items-center gap-1.5"
                            onClick={() =>
                              canRenameLocation && startNameEdit(loc)
                            }
                          >
                            {loc.name}
                            {canRenameLocation && (
                              <Pencil
                                size={12}
                                className="opacity-0 group-hover:opacity-40 transition-opacity"
                              />
                            )}
                          </h4>
                        )}
                        {loc.is_primary && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-amber-50 text-amber-700 border border-amber-200">
                            <Star size={10} className="fill-amber-500" />
                            Primary
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    {canManageConnections && (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleChangeGBP(loc.id)}
                          className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-alloro-orange bg-alloro-orange/10 rounded-xl hover:bg-alloro-orange/20 transition-colors"
                        >
                          <RefreshCw size={12} className="inline mr-1.5" />
                          {gbpProp ? "Change GBP" : "Connect GBP"}
                        </button>
                        {!loc.is_primary && (
                          <button
                            onClick={() => handleSetPrimary(loc.id)}
                            className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
                          >
                            Set Primary
                          </button>
                        )}
                        {locations.length > 1 && (
                          <button
                            onClick={() => initiateDelete(loc.id)}
                            className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                            title="Remove location"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* GBP Info — full width below header */}
                  {gbpProp ? (
                    <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <p className="text-sm font-bold text-alloro-navy">
                        {gbpProp.display_name}
                      </p>
                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                        Location ID: {gbpProp.external_id}
                      </p>
                    </div>
                  ) : (
                    <p className="text-slate-400 text-sm mt-4">
                      No GBP profile connected
                    </p>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Change GBP Modal */}
      <PropertySelectionModal
        isOpen={gbpModalOpen}
        onClose={() => {
          setGbpModalOpen(false);
          setGbpTargetLocationId(null);
        }}
        title="Select GBP Profile"
        items={availableGBP}
        onSelect={handleGBPSelected}
        isLoading={loadingAvailable}
        isSaving={isSaving}
        type="gbp"
        multiSelect={false}
      />

      {/* Add Location Modal — only shown during name step */}
      <AnimatePresence>
        {addModalOpen && addStep === "name" && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-alloro-navy/50 backdrop-blur-sm"
              onClick={() => setAddModalOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="relative bg-white rounded-[28px] shadow-2xl w-full max-w-md overflow-hidden"
            >
              <div className="p-8">
                <h3 className="font-display text-lg font-medium text-alloro-navy tracking-tight mb-1">
                  Add New Location
                </h3>
                <p className="text-slate-400 text-sm mb-6">
                  Enter the name for your new location
                </p>
                <input
                  value={newLocationName}
                  onChange={(e) => setNewLocationName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddNameSubmit();
                  }}
                  placeholder="e.g. Downtown Office"
                  autoFocus
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-alloro-navy font-semibold focus:outline-none focus:ring-2 focus:ring-alloro-orange/30 focus:border-alloro-orange"
                />
                <div className="flex justify-end gap-3 mt-6">
                  <button
                    onClick={() => setAddModalOpen(false)}
                    className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddNameSubmit}
                    disabled={!newLocationName.trim()}
                    className="px-5 py-2.5 text-sm font-bold text-white bg-alloro-orange rounded-xl hover:bg-alloro-orange/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Next: Select GBP
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Location - GBP Selection (shown in step 2) */}
      <PropertySelectionModal
        isOpen={addStep === "gbp" && addModalOpen}
        onClose={() => {
          setAddModalOpen(false);
          setAddStep("name");
        }}
        title={`Select GBP for "${newLocationName}"`}
        items={availableGBP}
        onSelect={handleAddGBPSelected}
        isLoading={loadingAvailable}
        isSaving={isSaving}
        type="gbp"
        multiSelect={false}
      />

      {/* Delete Confirmation */}
      <ConfirmModal
        isOpen={deleteConfirmOpen}
        onClose={() => {
          setDeleteConfirmOpen(false);
          setDeleteTargetId(null);
        }}
        onConfirm={handleConfirmDelete}
        title="Remove Location?"
        message="This will remove the location and disconnect its GBP profile. Existing data (tasks, reports, etc.) will no longer be associated with this location."
        confirmText="Remove"
        isLoading={isDeleting}
        type="danger"
      />
    </div>
  );
};
