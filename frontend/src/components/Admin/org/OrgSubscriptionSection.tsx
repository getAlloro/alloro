import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Crown,
  Globe,
  Lock,
  Unlock,
  CreditCard,
  Link2,
  Loader2,
  ChevronDown,
  Tag,
  Clock,
  ExternalLink,
  Receipt,
  XCircle,
  ChevronRight,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { useConfirm } from "../../ui/ConfirmModal";
import {
  adminCreateProject,
  adminRemovePaymentMethod,
  adminLockoutOrganization,
  adminUnlockOrganization,
  adminUpdateOrganizationType,
  adminGetBillingDetails,
  type AdminOrganizationDetail,
  type AdminBillingDetails,
} from "../../../api/admin-organizations";
import { fetchWebsites, linkWebsiteToOrganization } from "../../../api/websites";
import { isAxiosError } from "../../../api";
import { getErrorMessage } from "../../../lib/errorMessage";

interface OrgSubscriptionSectionProps {
  org: AdminOrganizationDetail;
  orgId: number;
  onRefresh: () => Promise<void>;
}

export function OrgSubscriptionSection({
  org,
  orgId,
  onRefresh,
}: OrgSubscriptionSectionProps) {
  const confirm = useConfirm();
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isRemovingPayment, setIsRemovingPayment] = useState(false);
  const [isLockoutLoading, setIsLockoutLoading] = useState(false);
  const [isSavingType, setIsSavingType] = useState(false);
  const [billingDetails, setBillingDetails] = useState<AdminBillingDetails | null>(null);
  const [showInvoices, setShowInvoices] = useState(false);

  // Fetch billing details if org has Stripe
  useEffect(() => {
    if (org.stripe_customer_id) {
      adminGetBillingDetails(orgId)
        .then((data) => {
          if (data.success !== false) setBillingDetails(data);
        })
        .catch(() => {});
    }
  }, [org.stripe_customer_id, orgId]);

  // Attach Website state
  const [showAttachDropdown, setShowAttachDropdown] = useState(false);
  const [unlinkedWebsites, setUnlinkedWebsites] = useState<
    Array<{ id: string; generated_hostname: string }>
  >([]);
  const [loadingWebsites, setLoadingWebsites] = useState(false);
  const [isAttaching, setIsAttaching] = useState(false);
  const attachDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        attachDropdownRef.current &&
        !attachDropdownRef.current.contains(e.target as Node)
      ) {
        setShowAttachDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const loadUnlinkedWebsites = useCallback(async () => {
    try {
      setLoadingWebsites(true);
      const response = await fetchWebsites({ limit: 500 });
      const unlinked = response.data
        .filter((w) => !w.organization)
        .map((w) => ({ id: w.id, generated_hostname: w.generated_hostname }));
      setUnlinkedWebsites(unlinked);
    } catch {
      toast.error("Failed to load websites");
    } finally {
      setLoadingWebsites(false);
    }
  }, []);

  const handleCreateProject = async () => {
    setIsCreatingProject(true);
    try {
      const response = await adminCreateProject(orgId);
      if (response.success) {
        toast.success(response.message);
        await onRefresh();
      } else {
        toast.error(
          (response as { error?: string }).error || "Failed to create project",
        );
      }
    } catch (error: unknown) {
      const message =
        (isAxiosError(error) ? error.response?.data?.error : undefined) ||
        getErrorMessage(error) ||
        "Failed to create project";
      toast.error(message);
    } finally {
      setIsCreatingProject(false);
    }
  };

  const handleAttachWebsite = async (websiteId: string) => {
    setIsAttaching(true);
    setShowAttachDropdown(false);
    try {
      await linkWebsiteToOrganization(websiteId, orgId);
      toast.success("Website attached to organization");
      await onRefresh();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error) || "Failed to attach website");
    } finally {
      setIsAttaching(false);
    }
  };

  const handleRemovePayment = async () => {
    const confirmed = await confirm({
      title: `Remove payment method for "${org.name}"?`,
      message:
        "This will cancel their Stripe subscription and revert them to admin-granted state (no billing).",
      confirmLabel: "Remove",
      variant: "danger",
    });
    if (!confirmed) return;

    setIsRemovingPayment(true);
    try {
      const response = await adminRemovePaymentMethod(orgId);
      if (response.success) {
        toast.success(response.message);
        await onRefresh();
      } else {
        toast.error(
          (response as { error?: string }).error ||
            "Failed to remove payment method",
        );
      }
    } catch (error: unknown) {
      const message =
        (isAxiosError(error) ? error.response?.data?.error : undefined) ||
        getErrorMessage(error) ||
        "Failed to remove payment method";
      toast.error(message);
    } finally {
      setIsRemovingPayment(false);
    }
  };

  const handleLockout = async () => {
    setIsLockoutLoading(true);
    try {
      const response = await adminLockoutOrganization(orgId);
      if (response.success) {
        toast.success(response.message);
        await onRefresh();
      } else {
        toast.error(
          (response as { error?: string }).error ||
            "Failed to lock out organization",
        );
      }
    } catch {
      toast.error("Failed to lock out organization");
    } finally {
      setIsLockoutLoading(false);
    }
  };

  const handleUnlock = async () => {
    setIsLockoutLoading(true);
    try {
      const response = await adminUnlockOrganization(orgId);
      if (response.success) {
        toast.success(response.message);
        await onRefresh();
      } else {
        toast.error("Failed to unlock organization");
      }
    } catch {
      toast.error("Failed to unlock organization");
    } finally {
      setIsLockoutLoading(false);
    }
  };

  const handleSetOrgType = async (type: "health" | "generic") => {
    const label = type === "generic" ? "Generic" : "Health";
    const confirmed = await confirm({
      title: `Set organization type to "${label}"?`,
      message:
        "Organization type controls the vocabulary shown across the app (healthcare vs. generic) and the Stripe pricing used for this account.",
      confirmLabel: `Set to ${label}`,
      variant: "danger",
    });
    if (!confirmed) return;

    setIsSavingType(true);
    try {
      const response = await adminUpdateOrganizationType(orgId, type);
      if (response.success) {
        toast.success(response.message);
        await onRefresh();
      } else {
        toast.error(
          (response as { error?: string }).error ||
            "Failed to set organization type",
        );
      }
    } catch (error: unknown) {
      const message =
        (isAxiosError(error) ? error.response?.data?.error : undefined) ||
        getErrorMessage(error) ||
        "Failed to set organization type";
      toast.error(message);
    } finally {
      setIsSavingType(false);
    }
  };

  // Derive billing status for display
  const billingStatusBadge = (() => {
    if (org.subscription_status === "inactive")
      return { label: "Locked Out", icon: Lock, bg: "bg-red-50", text: "text-red-700", border: "border-red-200" };
    if (org.subscription_status === "cancelled")
      return { label: "Cancelled", icon: XCircle, bg: "bg-red-50", text: "text-red-700", border: "border-red-200" };
    if (org.stripe_customer_id && billingDetails?.cancelAtPeriodEnd)
      return { label: "Cancelling", icon: Clock, bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" };
    if (org.stripe_customer_id)
      return { label: "Stripe Active", icon: CreditCard, bg: "bg-green-50", text: "text-green-700", border: "border-green-200" };
    if (org.subscription_status === "active")
      return { label: "Admin-Granted", icon: Crown, bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" };
    return null;
  })();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* ─── Section 1: Organization Overview ─── */}
      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-5 py-3 bg-gray-50/80 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Crown className="h-4 w-4 text-alloro-orange" />
            <h3 className="text-sm font-bold text-gray-900">Overview</h3>
          </div>
          {billingStatusBadge && (
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold rounded-full ${billingStatusBadge.bg} ${billingStatusBadge.text} border ${billingStatusBadge.border}`}>
              <billingStatusBadge.icon className="h-3 w-3" />
              {billingStatusBadge.label}
            </span>
          )}
        </div>

        <div className="px-5 py-4">
          <div className="grid grid-cols-3 gap-6">
            {/* Type */}
            <div>
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Type</div>
              <div className="flex items-center gap-2">
                <select
                  disabled={isSavingType}
                  value={org.organization_type ?? ""}
                  onChange={(e) => {
                    if (e.target.value) handleSetOrgType(e.target.value as "health" | "generic");
                  }}
                  className="text-xs border border-gray-300 rounded-md px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-alloro-orange/50 disabled:opacity-50"
                >
                  <option value="" disabled>Select...</option>
                  <option value="health">Health</option>
                  <option value="generic">Generic</option>
                </select>
                {isSavingType && <Loader2 className="h-3 w-3 animate-spin text-gray-400" />}
              </div>
            </div>

            {/* Tier */}
            <div>
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Tier</div>
              <span className="text-sm font-bold text-gray-900">DFY</span>
            </div>

            {/* Website Project */}
            <div>
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Project</div>
              {org.website ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700">
                  <Globe className="h-3 w-3" />
                  {org.website.generated_hostname}
                </span>
              ) : (
                <span className="text-xs text-gray-400">None</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Section 2: Billing & Payment (only if Stripe) ─── */}
      {org.stripe_customer_id && (
        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          <div className="px-5 py-3 bg-gray-50/80 border-b border-gray-100 flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-gray-400" />
            <h3 className="text-sm font-bold text-gray-900">Billing</h3>
          </div>

          <div className="px-5 py-4 space-y-4">
            {/* Payment details grid */}
            <div className="grid grid-cols-3 gap-6">
              {/* Payment Method */}
              <div>
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Payment Method</div>
                {billingDetails?.paymentMethod ? (
                  <div className="flex items-center gap-1.5">
                    <CreditCard className="h-3.5 w-3.5 text-gray-400" />
                    <span className="text-sm font-medium text-gray-800">
                      {billingDetails.paymentMethod.brand.charAt(0).toUpperCase() + billingDetails.paymentMethod.brand.slice(1)} •••• {billingDetails.paymentMethod.last4}
                    </span>
                    <span className="text-xs text-gray-400">
                      {String(billingDetails.paymentMethod.expMonth).padStart(2, "0")}/{billingDetails.paymentMethod.expYear}
                    </span>
                  </div>
                ) : (
                  <span className="text-xs text-gray-400">No card on file</span>
                )}
              </div>

              {/* Coupon */}
              <div>
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Coupon</div>
                {billingDetails?.discount ? (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-green-700">
                    <Tag className="h-3 w-3" />
                    {billingDetails.discount.couponName}
                    {billingDetails.discount.percentOff
                      ? ` (${billingDetails.discount.percentOff}% off)`
                      : billingDetails.discount.amountOff
                        ? ` ($${billingDetails.discount.amountOff} off)`
                        : ""}
                  </span>
                ) : (
                  <span className="text-xs text-gray-400">None</span>
                )}
              </div>

              {/* Cancel State */}
              <div>
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Cancel State</div>
                {billingDetails?.canceledAt ? (
                  <span className="text-xs font-medium text-red-600">
                    Cancelled {new Date(billingDetails.canceledAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                ) : billingDetails?.cancelAtPeriodEnd ? (
                  <span className="text-xs font-medium text-amber-600">Ending at period close</span>
                ) : (
                  <span className="text-xs text-gray-400">—</span>
                )}
              </div>
            </div>

            {/* Invoice Table */}
            {billingDetails && billingDetails.invoices.length > 0 && (
              <div>
                <button
                  onClick={() => setShowInvoices(!showInvoices)}
                  className="flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-gray-700 transition-colors mb-2"
                >
                  <Receipt className="h-3.5 w-3.5" />
                  Invoices ({billingDetails.invoices.length})
                  <ChevronRight
                    className={`h-3 w-3 transition-transform duration-200 ${showInvoices ? "rotate-90" : ""}`}
                  />
                </button>

                {showInvoices && (
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          <th className="px-3 py-2 font-bold text-[10px] text-gray-400 uppercase tracking-wider">Date</th>
                          <th className="px-3 py-2 font-bold text-[10px] text-gray-400 uppercase tracking-wider">Amount</th>
                          <th className="px-3 py-2 font-bold text-[10px] text-gray-400 uppercase tracking-wider">Status</th>
                          <th className="px-3 py-2 font-bold text-[10px] text-gray-400 uppercase tracking-wider">Coupon</th>
                          <th className="px-3 py-2 font-bold text-[10px] text-gray-400 uppercase tracking-wider">Invoice</th>
                        </tr>
                      </thead>
                      <tbody>
                        {billingDetails.invoices.map((inv) => (
                          <tr key={inv.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/50">
                            <td className="px-3 py-2 text-gray-600 font-medium">
                              {new Date(inv.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </td>
                            <td className="px-3 py-2 font-bold text-gray-900 tabular-nums">
                              ${inv.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="px-3 py-2">
                              <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${
                                inv.status === "paid"
                                  ? "bg-green-50 text-green-700"
                                  : inv.status === "open"
                                    ? "bg-amber-50 text-amber-700"
                                    : "bg-red-50 text-red-700"
                              }`}>
                                {inv.status}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-gray-500">{inv.coupon || "—"}</td>
                            <td className="px-3 py-2">
                              {inv.hostedInvoiceUrl ? (
                                <a
                                  href={inv.hostedInvoiceUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-alloro-orange hover:text-alloro-orange/80 inline-flex items-center gap-0.5 font-medium"
                                >
                                  <ExternalLink className="h-3 w-3" /> View
                                </a>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Section 3: Actions ─── */}
      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-5 py-3 bg-gray-50/80 border-b border-gray-100">
          <h3 className="text-sm font-bold text-gray-900">Actions</h3>
        </div>

        <div className="px-5 py-4 flex items-center gap-3 flex-wrap">
          {!org.website && (
            <button
              onClick={handleCreateProject}
              disabled={isCreatingProject}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-alloro-orange rounded-lg hover:bg-alloro-orange/90 transition-colors disabled:opacity-50"
            >
              <Globe className="h-3.5 w-3.5" />
              {isCreatingProject ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Project"
              )}
            </button>
          )}

          {!org.website && (
            <div className="relative" ref={attachDropdownRef}>
              <button
                onClick={() => {
                  if (!showAttachDropdown) loadUnlinkedWebsites();
                  setShowAttachDropdown(!showAttachDropdown);
                }}
                disabled={isAttaching}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                <Link2 className="h-3.5 w-3.5" />
                {isAttaching ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Attaching...
                  </>
                ) : (
                  "Attach Website"
                )}
                <ChevronDown
                  className={`h-3 w-3 transition-transform ${showAttachDropdown ? "rotate-180" : ""}`}
                />
              </button>

              {showAttachDropdown && (
                <div className="absolute left-0 mt-2 w-72 bg-white rounded-xl shadow-lg border border-gray-200 py-2 z-50">
                  {loadingWebsites ? (
                    <div className="flex items-center gap-2 px-4 py-2 text-sm text-gray-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading websites...
                    </div>
                  ) : unlinkedWebsites.length === 0 ? (
                    <div className="px-4 py-2 text-sm text-gray-500">
                      No unlinked websites available
                    </div>
                  ) : (
                    <>
                      <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase">
                        Available Websites
                      </div>
                      {unlinkedWebsites.map((site) => (
                        <button
                          key={site.id}
                          onClick={() => handleAttachWebsite(site.id)}
                          disabled={isAttaching}
                          className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-alloro-orange/5 w-full text-left disabled:opacity-50"
                        >
                          <Globe className="h-4 w-4" />
                          {site.generated_hostname}
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {org.stripe_customer_id && (
            <button
              onClick={handleRemovePayment}
              disabled={isRemovingPayment}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              <CreditCard className="h-3.5 w-3.5" />
              {isRemovingPayment ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Removing...
                </>
              ) : (
                "Remove Payment"
              )}
            </button>
          )}

          {org.subscription_status !== "inactive" && !org.stripe_customer_id && (
            <button
              onClick={handleLockout}
              disabled={isLockoutLoading}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              <Lock className="h-3.5 w-3.5" />
              {isLockoutLoading ? "Locking..." : "Lock Out"}
            </button>
          )}
          {org.subscription_status === "inactive" && (
            <button
              onClick={handleUnlock}
              disabled={isLockoutLoading}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-green-700 border border-green-300 rounded-lg hover:bg-green-50 transition-colors disabled:opacity-50"
            >
              <Unlock className="h-3.5 w-3.5" />
              {isLockoutLoading ? "Unlocking..." : "Unlock"}
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
