import React from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";

interface BusinessDataDetailModalProps {
  viewingData: {
    locationName: string;
    data: Record<string, unknown>;
  };
  onClose: () => void;
  formatRefreshedAt: (data: Record<string, unknown> | null) => string;
}

export function BusinessDataDetailModal({
  viewingData,
  onClose,
  formatRefreshedAt,
}: BusinessDataDetailModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="absolute inset-0 bg-gray-900/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative w-full max-w-lg max-h-[80vh] rounded-2xl bg-white shadow-xl overflow-hidden flex flex-col"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              Business Data
            </h3>
            <p className="text-sm text-gray-500">
              {viewingData.locationName}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-4">
          {(() => {
            const d = viewingData.data;
            const addr = d.address as Record<string, unknown> | undefined;
            const hours = d.hours as Record<string, { open: string; close: string } | null> | undefined;
            const categories = d.categories as string[] | undefined;

            return (
              <>
                {/* Basic Info */}
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Basic Info
                  </h4>
                  <div className="grid grid-cols-[100px_1fr] gap-y-1.5 text-sm">
                    <span className="text-gray-500">Name</span>
                    <span className="text-gray-900 font-medium">
                      {(d.name as string) || "—"}
                    </span>
                    <span className="text-gray-500">Phone</span>
                    <span className="text-gray-900">
                      {(d.phone as string) || "—"}
                    </span>
                    <span className="text-gray-500">Website</span>
                    <span className="text-gray-900 truncate">
                      {d.website ? (
                        <a
                          href={d.website as string}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          {d.website as string}
                        </a>
                      ) : (
                        "—"
                      )}
                    </span>
                    <span className="text-gray-500">Place ID</span>
                    <span className="text-gray-900 font-mono text-xs break-all">
                      {(d.place_id as string) || "—"}
                    </span>
                  </div>
                </div>

                {/* Address */}
                {addr && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                      Address
                    </h4>
                    <div className="grid grid-cols-[100px_1fr] gap-y-1.5 text-sm">
                      <span className="text-gray-500">Street</span>
                      <span className="text-gray-900">
                        {(addr.street as string) || "—"}
                      </span>
                      {addr.suite ? (
                        <>
                          <span className="text-gray-500">Suite</span>
                          <span className="text-gray-900">
                            {addr.suite as string}
                          </span>
                        </>
                      ) : null}
                      <span className="text-gray-500">City</span>
                      <span className="text-gray-900">
                        {(addr.city as string) || "—"}
                      </span>
                      <span className="text-gray-500">State</span>
                      <span className="text-gray-900">
                        {(addr.state as string) || "—"}
                      </span>
                      <span className="text-gray-500">ZIP</span>
                      <span className="text-gray-900">
                        {(addr.zip as string) || "—"}
                      </span>
                      <span className="text-gray-500">Country</span>
                      <span className="text-gray-900">
                        {(addr.country as string) || "—"}
                      </span>
                    </div>
                  </div>
                )}

                {/* Categories */}
                {categories && categories.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                      Categories
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {categories.map((cat, i) => (
                        <span
                          key={i}
                          className="px-2.5 py-1 text-xs font-medium text-gray-700 bg-gray-100 border border-gray-200 rounded-full"
                        >
                          {cat}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Hours */}
                {hours && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                      Business Hours
                    </h4>
                    <div className="grid grid-cols-[100px_1fr] gap-y-1.5 text-sm">
                      {[
                        "monday",
                        "tuesday",
                        "wednesday",
                        "thursday",
                        "friday",
                        "saturday",
                        "sunday",
                      ].map((day) => {
                        const h = hours[day];
                        return (
                          <React.Fragment key={day}>
                            <span className="text-gray-500 capitalize">
                              {day}
                            </span>
                            <span className="text-gray-900">
                              {h
                                ? `${h.open} — ${h.close}`
                                : "Closed"}
                            </span>
                          </React.Fragment>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Coordinates */}
                {d.coordinates && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                      Coordinates
                    </h4>
                    <p className="text-sm text-gray-700 font-mono">
                      {(d.coordinates as { lat: number; lng: number }).lat},{" "}
                      {(d.coordinates as { lat: number; lng: number }).lng}
                    </p>
                  </div>
                )}

                {/* Description */}
                {d.description && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                      Description
                    </h4>
                    <p className="text-sm text-gray-700">
                      {d.description as string}
                    </p>
                  </div>
                )}

                {/* Last Refreshed */}
                <div className="pt-2 border-t border-gray-100">
                  <p className="text-xs text-gray-400">
                    Last refreshed: {formatRefreshedAt(d)}
                  </p>
                </div>
              </>
            );
          })()}
        </div>
      </motion.div>
    </div>
  );
}
