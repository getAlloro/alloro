// Copied from: frontend/src/components/settings/BillingTab.tsx @ v0.0.82
// Visual-only replica — Stripe integration, useSearchParams, billing API calls,
// checkout/portal loading state, toast, and useEffect data fetching have been
// stripped. Shows the "Active Subscription" state only with hardcoded data.

import {
  CreditCard,
  Crown,
  CheckCircle2,
  Zap,
  Globe,
  BarChart3,
  FileText,
  Users,
  ExternalLink,
  Receipt,
} from "lucide-react";
import type { ReplicaProps } from "../../types/docs";
import { DashboardLayout } from "./DashboardLayout";
import { SettingsTabs } from "./SettingsTabs";
import { HotspotZone } from "../HotspotZone";

// ─── Plan Details (Single Product) ───

const PLAN = {
  name: "Alloro Intelligence",
  features: [
    { icon: BarChart3, label: "Practice rankings tracking" },
    { icon: FileText, label: "Task management" },
    { icon: Users, label: "Team collaboration" },
    { icon: Zap, label: "AI-powered insights" },
    { icon: Globe, label: "AI-powered website builder" },
    { icon: Crown, label: "Custom domain support" },
  ],
};

// ─── Hardcoded invoice rows ───

const INVOICES = [
  { id: "inv_may2026", date: "May 1, 2026", amount: "$299.00", status: "paid", coupon: null, url: "#" },
  { id: "inv_apr2026", date: "Apr 1, 2026", amount: "$299.00", status: "paid", coupon: null, url: "#" },
];

export function BillingReplica({
  hotspots,
  activeHotspotId,
  onHotspotClick,
}: ReplicaProps) {
  const findHotspot = (id: string) => hotspots.find((h) => h.id === id);

  return (
    <DashboardLayout activeItem="billing">
      <div className="mx-auto max-w-4xl space-y-8">
        {/* Settings Tabs */}
        <HotspotZone
          id="settings-tabs"
          hotspot={findHotspot("settings-tabs")}
          isActive={activeHotspotId === "settings-tabs"}
          onHotspotClick={onHotspotClick}
        >
          <div className="mb-6">
            <SettingsTabs activeTab="billing" />
          </div>
        </HotspotZone>

        {/* ── Active Subscription Card ── */}
        <HotspotZone
          id="subscription-card"
          hotspot={findHotspot("subscription-card")}
          isActive={activeHotspotId === "subscription-card"}
          onHotspotClick={onHotspotClick}
        >
          <div className="rounded-[2rem] border border-black/5 shadow-premium relative overflow-hidden">
            {/* Orange header strip */}
            <div className="bg-alloro-orange px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 lg:pt-8 pb-10 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-72 h-72 bg-white/[0.08] rounded-full blur-3xl -mr-36 -mt-36 pointer-events-none" />
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-black/[0.04] rounded-full blur-2xl -ml-24 -mb-24 pointer-events-none" />

              <div className="relative z-10 flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-white/20 border border-white/20 flex items-center justify-center">
                      <Crown size={18} className="text-white" />
                    </div>
                    <div className="px-2.5 py-1 bg-white/20 border border-white/25 rounded-full flex items-center gap-1.5">
                      <CheckCircle2 size={12} className="text-white" />
                      <span className="text-white text-[10px] font-black uppercase tracking-wider">
                        Active
                      </span>
                    </div>
                  </div>
                  <h3 className="font-display text-lg sm:text-xl lg:text-2xl font-medium text-white tracking-tight mb-0.5">
                    {PLAN.name}
                  </h3>
                  <p className="text-white/60 text-sm font-medium">
                    Your active subscription
                  </p>
                </div>

                <p className="text-white/40 text-xs font-medium mt-1 text-right">
                  Renews Jun 15, 2026
                </p>
              </div>
            </div>

            {/* White body with details */}
            <div className="bg-white px-4 sm:px-6 lg:px-8 pb-4 sm:pb-6 lg:pb-8 pt-4 sm:pt-6 relative space-y-6">
              {/* Payment method pill */}
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-xl border border-black/5">
                  <CreditCard size={14} className="text-slate-400" />
                  <span className="text-sm text-slate-600 font-medium">
                    Visa ending in 4242
                  </span>
                  <span className="text-xs text-slate-400">
                    12/28
                  </span>
                </div>
              </div>

              {/* Features grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                {PLAN.features.map((feature, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2.5 group"
                  >
                    <div className="w-7 h-7 rounded-lg bg-alloro-orange/[0.07] flex items-center justify-center shrink-0 group-hover:bg-alloro-orange/15 transition-colors">
                      <feature.icon
                        size={14}
                        className="text-alloro-orange"
                      />
                    </div>
                    <span className="text-sm text-slate-600 font-medium">
                      {feature.label}
                    </span>
                  </div>
                ))}
              </div>

              <div className="pt-4 border-t border-black/5">
                <HotspotZone
                  id="manage-btn"
                  hotspot={findHotspot("manage-btn")}
                  isActive={activeHotspotId === "manage-btn"}
                  onHotspotClick={onHotspotClick}
                >
                  <button
                    type="button"
                    className="px-5 py-2.5 bg-alloro-navy text-white rounded-xl text-sm font-bold hover:bg-alloro-navy/90 transition-all flex items-center gap-2"
                  >
                    <CreditCard size={16} />
                    Manage Subscription
                  </button>
                </HotspotZone>
              </div>
            </div>
          </div>
        </HotspotZone>

        {/* Invoice History */}
        <HotspotZone
          id="payment-history"
          hotspot={findHotspot("payment-history")}
          isActive={activeHotspotId === "payment-history"}
          onHotspotClick={onHotspotClick}
        >
          <div className="bg-white rounded-[2rem] border border-black/5 p-4 sm:p-6 lg:p-8 shadow-premium">
            <div className="flex items-center gap-2.5 mb-5">
              <Receipt size={18} className="text-alloro-navy/40" />
              <h3 className="text-lg font-black text-alloro-navy tracking-tight">
                Payment History
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-black/5">
                    <th className="text-[10px] font-black text-slate-400 uppercase tracking-widest pb-3 pr-4">
                      Date
                    </th>
                    <th className="text-[10px] font-black text-slate-400 uppercase tracking-widest pb-3 pr-4">
                      Amount
                    </th>
                    <th className="text-[10px] font-black text-slate-400 uppercase tracking-widest pb-3 pr-4">
                      Status
                    </th>
                    <th className="text-[10px] font-black text-slate-400 uppercase tracking-widest pb-3 pr-4">
                      Coupon
                    </th>
                    <th className="text-[10px] font-black text-slate-400 uppercase tracking-widest pb-3">
                      Invoice
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {INVOICES.map((invoice, idx) => (
                    <tr
                      key={invoice.id}
                      className="border-b border-black/[0.03] last:border-0"
                    >
                      <td className="py-3 pr-4 text-sm text-slate-600 font-medium">
                        {invoice.date}
                      </td>
                      <td className="py-3 pr-4 text-sm text-alloro-navy font-bold">
                        {invoice.amount}
                      </td>
                      <td className="py-3 pr-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-green-50 text-green-700 border border-green-200">
                          {invoice.status}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-sm text-slate-500">
                        {invoice.coupon || "—"}
                      </td>
                      <td className="py-3">
                        {idx === 1 ? (
                          <a
                            href="#"
                            className="text-alloro-orange hover:text-alloro-orange/80 transition-colors inline-flex items-center gap-1"
                          >
                            <ExternalLink size={12} />
                            <span className="text-xs font-bold">View</span>
                          </a>
                        ) : (
                          <span className="text-slate-300 text-xs">{"—"}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </HotspotZone>
      </div>
    </DashboardLayout>
  );
}
