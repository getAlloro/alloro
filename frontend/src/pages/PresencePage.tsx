/**
 * Presence -- "What does my online presence look like?"
 *
 * The mirror. What a customer sees when they Google you.
 *
 * Sections:
 * 1. Your website (preview + natural language editor)
 * 2. Your GBP profile (completeness, performance: calls/directions/clicks)
 * 3. Search presence (focus keywords, positions, SEO score)
 * 4. Compliance check (FTC-risky claims flagged)
 */

import { useState, Component, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Globe,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  PenLine,
  Sparkles,
  MousePointerClick,
} from "lucide-react";
import { apiGet } from "@/api/index";
import { useAuth } from "@/hooks/useAuth";
import { useLocationContext } from "@/contexts/locationContext";
import { useNavigate } from "react-router-dom";
import WarmEmptyState, { WARM_STATES } from "@/components/dashboard/WarmEmptyState";

// Import existing components from parts shelf
import GBPConnectCard from "@/components/dashboard/GBPConnectCard";
import AnswerEngineModule from "@/components/answerEngine/AnswerEngineModule";

// Error boundary to prevent page crash from taking out the entire layout
class PresenceErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error) { console.error("[PresencePage] Render error:", error); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F8F6F2] flex items-center justify-center">
          <div className="text-center max-w-sm">
            <AlertCircle className="w-8 h-8 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">Your presence data is loading. Try refreshing in a moment.</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
// FocusKeywords removed: not a vital sign per constitution

// ─── Collapsible Section ────────────────────────────────────────────

function Section({ title, icon: Icon, defaultOpen = true, children }: {
  title: string;
  icon?: any;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl bg-stone-50/80 border border-stone-200/60 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-50/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4 text-gray-400" />}
          <h2 className="text-sm font-semibold text-[#1A1D23] uppercase tracking-wider">{title}</h2>
        </div>
        {open
          ? <ChevronDown className="w-4 h-4 text-gray-400" />
          : <ChevronRight className="w-4 h-4 text-gray-400" />
        }
      </button>
      {open && <div className="px-6 pb-6">{children}</div>}
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────

export default function PresencePage() {
  return (
    <PresenceErrorBoundary>
      <PresencePageInner />
    </PresenceErrorBoundary>
  );
}

function PresencePageInner() {
  const navigate = useNavigate();
  const { userProfile, hasGoogleConnection } = useAuth();
  const { selectedLocation } = useLocationContext();
  const orgId = userProfile?.organizationId || null;

  // Dashboard context for GBP data
  const { data: ctx } = useQuery<any>({
    queryKey: ["presence-context", orgId, selectedLocation?.id],
    queryFn: () => apiGet({ path: "/user/dashboard-context" }),
    enabled: !!orgId,
    staleTime: 60_000,
  });

  // Website data
  const { data: websiteData } = useQuery<any>({
    queryKey: ["presence-website", orgId],
    queryFn: () => apiGet({ path: "/user/website" }).catch(() => null),
    enabled: !!orgId,
    staleTime: 120_000,
  });

  // Form submissions
  const { data: formData } = useQuery<{ submissions: any[] }>({
    queryKey: ["form-submissions", orgId],
    queryFn: () => apiGet({ path: "/user/website/form-submissions" }).catch(() => ({ submissions: [] })),
    enabled: !!orgId && !!websiteData?.website,
    staleTime: 120_000,
  });
  const formSubmissions = formData?.submissions || [];

  // CRO insights
  const { data: croData } = useQuery<{ insights: any[] }>({
    queryKey: ["cro-insights", orgId],
    queryFn: () => apiGet({ path: "/user/cro-insights" }),
    enabled: !!orgId,
    staleTime: 120_000,
  });
  const croInsights = croData?.insights || [];

  const website = websiteData?.website || null;
  const hasWebsite = !!website;
  const websiteUrl = website?.liveUrl || (website?.generated_hostname ? `https://${website.generated_hostname}.sites.getalloro.com` : null);

  // Extract GBP profile data from checkup
  const checkupData = ctx?.org?.checkup_data || null;
  const place = checkupData?.place || {};
  const orgName = ctx?.org?.name || "";
  const googleSearchUrl = orgName ? `https://www.google.com/search?q=${encodeURIComponent(orgName)}` : null;

  // GBP profile completeness
  const gbpFields = [
    { label: "Phone number", complete: !!(place.hasPhone || place.phone || place.nationalPhoneNumber || place.internationalPhoneNumber), value: place.nationalPhoneNumber || place.internationalPhoneNumber || place.phone || null },
    { label: "Business hours", complete: !!(place.hasHours || place.hours || place.regularOpeningHours), value: place.regularOpeningHours ? "Set" : null },
    { label: "Website", complete: !!(place.hasWebsite || place.websiteUri || place.website), value: place.websiteUri || place.website || null },
    { label: "Photos", complete: (place.photosCount || place.photoCount || place.photos?.length || 0) > 0, value: `${place.photosCount || place.photoCount || place.photos?.length || 0} photos` },
    { label: "Business description", complete: !!(place.hasEditorialSummary || place.editorialSummary), value: null },
  ];
  const gbpComplete = gbpFields.filter(f => f.complete).length;
  const gbpTotal = gbpFields.length;
  const hasGBPData = gbpFields.some(f => f.complete);

  return (
    <div className="min-h-screen bg-[#F8F6F2]">
      <div className="max-w-[800px] mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-4">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="text-2xl font-semibold text-[#1A1D23] tracking-tight">Your Online Presence</h1>
          <p className="text-sm text-gray-400 mt-1">What customers see when they search for you on Google.</p>
        </motion.div>

        {/* GBP Connection (if not connected) */}
        {!hasGoogleConnection && (
          <GBPConnectCard gbpConnected={!!hasGoogleConnection} orgId={orgId} />
        )}

        {/* Answer Engine module (Phase 4 -- gated server-side by feature flag) */}
        {orgId && (
          <Section title="Answer Engine" icon={Sparkles} defaultOpen={true}>
            <AnswerEngineModule practiceId={orgId} />
          </Section>
        )}

        {/* GBP Profile Completeness */}
        {hasGBPData && (
          <Section title="Google Business Profile" icon={Globe} defaultOpen={true}>
            <div className="space-y-4">
              {/* Score bar */}
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-[#1A1D23]">{gbpComplete}/{gbpTotal} fields complete</span>
                    {googleSearchUrl && (
                      <a
                        href={googleSearchUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[#D56753] hover:underline"
                      >
                        View on Google <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                  <div className="w-full h-2 bg-stone-200/60 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${gbpComplete >= gbpTotal ? "bg-emerald-500" : gbpComplete >= 3 ? "bg-amber-400" : "bg-red-400"}`}
                      style={{ width: `${(gbpComplete / gbpTotal) * 100}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Field checklist */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {gbpFields.map((field) => (
                  <div key={field.label} className="flex items-center gap-2 py-1.5">
                    <span className={`w-2 h-2 rounded-full ${field.complete ? "bg-emerald-500" : "bg-stone-300"}`} />
                    <span className={`text-sm ${field.complete ? "text-[#1A1D23]" : "text-[#1A1D23]/40"}`}>
                      {field.label}
                    </span>
                  </div>
                ))}
              </div>

              {gbpComplete < gbpTotal && (
                <p className="text-sm text-gray-500">
                  Complete profiles appear in 2x more searches. Missing fields reduce your visibility in local search and AI-generated answers.
                </p>
              )}
            </div>
          </Section>
        )}

        {/* Website */}
        {(hasWebsite || !hasGBPData) && (
          <Section title="Your Website" icon={PenLine} defaultOpen={true}>
            {hasWebsite ? (
              <div className="space-y-3">
                <div className="rounded-xl bg-[#F0EDE8] p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[#1A1D23]">{website.generated_hostname}</p>
                    <p className="text-xs text-gray-400 capitalize">{website.status}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => navigate("/dfy/website")}
                      className="flex items-center gap-1 text-sm font-semibold text-[#D56753] hover:underline transition-colors"
                    >
                      Edit <PenLine className="w-3.5 h-3.5" />
                    </button>
                    {websiteUrl && (
                      <a
                        href={websiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-sm font-semibold text-[#D56753] hover:underline transition-colors"
                      >
                        View site <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <WarmEmptyState
                happening="Alloro builds your website from your Google reviews and business data."
                when="A preview appears here once your reviews are analyzed."
                promise="Your website will showcase the exact themes customers praise most in their reviews."
              />
            )}
          </Section>
        )}

        {/* Built to Convert -- form submissions */}
        {hasWebsite && (
          <Section title="Built to Convert" icon={MousePointerClick} defaultOpen={true}>
            {formSubmissions.length > 0 ? (
              <div className="space-y-3">
                <div className="rounded-xl bg-[#F0EDE8] p-4">
                  <p className="text-sm font-semibold text-[#1A1D23]">
                    {formSubmissions.length} form submission{formSubmissions.length !== 1 ? "s" : ""} received
                  </p>
                  {formSubmissions[0]?.created_at && (
                    <p className="text-xs text-gray-400 mt-1">
                      Most recent: {new Date(formSubmissions[0].created_at).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                Coming with CRO Engine, summer 2026. Once your site is tracking form submissions, you'll see how many leads it captured and when.
              </p>
            )}
          </Section>
        )}

        {/* Website Optimizations -- CRO insights */}
        {hasWebsite && (
          <Section title="Website Optimizations" icon={Sparkles} defaultOpen={true}>
            {croInsights.length > 0 ? (
            <div className="space-y-3">
              {croInsights.slice(0, 8).map((insight: any, i: number) => {
                const changeLabels: Record<string, string> = {
                  title: "Page title",
                  meta_description: "Meta description",
                  content_section: "Content",
                  cta: "Call to action",
                  new_page: "New page",
                };
                return (
                  <div key={i} className="rounded-xl bg-[#F0EDE8] p-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">
                        {changeLabels[insight.changeType] || insight.changeType}
                      </span>
                      {insight.date && (
                        <span className="text-xs text-gray-400">
                          {new Date(insight.date).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    {insight.rationale && (
                      <p className="text-sm text-[#1A1D23] mb-2">{insight.rationale}</p>
                    )}
                    {insight.recommendedValue && (
                      <p className="text-xs text-[#1A1D23]/60">
                        Recommendation: {insight.recommendedValue}
                      </p>
                    )}
                    {insight.pageUrl && insight.pageUrl !== "/" && (
                      <p className="text-xs text-gray-400 mt-1">{insight.pageUrl}</p>
                    )}
                  </div>
                );
              })}
            </div>
            ) : (
              <p className="text-sm text-gray-500">
                Coming with CRO Engine, summer 2026. This is where you'll see the specific changes Alloro recommends to turn more site visitors into customers.
              </p>
            )}
          </Section>
        )}

        {/* When nothing exists at all */}
        {!hasWebsite && !hasGBPData && !hasGoogleConnection && (
          <WarmEmptyState {...WARM_STATES.presence} />
        )}

      </div>
    </div>
  );
}
