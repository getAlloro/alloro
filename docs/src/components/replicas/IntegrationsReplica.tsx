// Copied from: frontend/src/pages/settings/IntegrationsRoute.tsx +
//              frontend/src/components/settings/PropertiesTab.tsx @ v0.0.82
// Visual-only replica — useSettingsScopes, usePmsStatus, useGoogleReconnect,
// useUserGscIntegration, useUserGscConnections, useUserGscSites,
// useSaveUserGscIntegration, useOnboardingWizard, OAuth flows, expandable
// section state, banner logic, and all API hooks have been stripped.
// Default state: GSC connected, no banners, no expanded properties section.

import {
  Globe,
  Mail,
  Shield,
  Lock,
  Activity,
  Search,
  ChevronDown,
  CheckCircle2,
  MapPin,
  Plus,
  Star,
} from "lucide-react";
import type { ReplicaProps } from "../../types/docs";
import { DashboardLayout } from "./DashboardLayout";
import { SettingsTabs } from "./SettingsTabs";
import { HotspotZone } from "../HotspotZone";

interface InfoRowProps {
  icon: React.ReactNode;
  label: string;
  value: string;
}

const InfoRow = ({ icon, label, value }: InfoRowProps) => (
  <div className="flex items-start gap-4 group">
    <div className="p-2.5 bg-alloro-bg text-alloro-navy/40 rounded-xl shrink-0 group-hover:text-alloro-orange group-hover:bg-alloro-orange/5 transition-all duration-500 border border-black/5 shadow-inner-soft group-hover:shadow-premium">
      {icon}
    </div>
    <div className="min-w-0 text-left">
      <div className="text-[8px] font-black text-alloro-textDark/30 uppercase tracking-[0.2em] mb-0.5 leading-none">
        {label}
      </div>
      <div className="text-base font-black text-alloro-navy tracking-tight truncate group-hover:translate-x-1 transition-transform">
        {value}
      </div>
    </div>
  </div>
);

export function IntegrationsReplica({
  hotspots,
  activeHotspotId,
  onHotspotClick,
}: ReplicaProps) {
  const findHotspot = (id: string) => hotspots.find((h) => h.id === id);

  return (
    <DashboardLayout activeItem="integrations">
      {/* Settings Tabs */}
      <HotspotZone
        id="settings-tabs"
        hotspot={findHotspot("settings-tabs")}
        isActive={activeHotspotId === "settings-tabs"}
        onHotspotClick={onHotspotClick}
      >
        <div className="mb-6">
          <SettingsTabs activeTab="integrations" />
        </div>
      </HotspotZone>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 lg:gap-12">
        {/* Left Column - Practice Identity */}
        <section className="xl:col-span-5 space-y-6">
          <HotspotZone
            id="practice-details"
            hotspot={findHotspot("practice-details")}
            isActive={activeHotspotId === "practice-details"}
            onHotspotClick={onHotspotClick}
          >
            <div className="px-1">
              <h2 className="text-lg font-black text-alloro-navy tracking-tight mb-1">
                Practice Details
              </h2>
              <p className="text-slate-500 text-sm">
                Your practice information and contact details
              </p>
            </div>

            <div className="mt-4 bg-white rounded-[2rem] border border-black/5 p-6 lg:p-8 shadow-premium space-y-6 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-64 h-64 bg-alloro-orange/[0.03] rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none group-hover:bg-alloro-orange/[0.06] transition-all duration-700" />

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-1 gap-x-8 gap-y-5 relative z-10">
                <InfoRow
                  icon={<Globe size={18} />}
                  label="Website"
                  value="smileclinic.com"
                />
                <InfoRow
                  icon={<Mail size={18} />}
                  label="Email"
                  value="info@smileclinic.com"
                />
              </div>
            </div>

            {/* Encryption notice card */}
            <div className="mt-4 bg-alloro-navy rounded-3xl p-6 lg:p-8 text-white relative overflow-hidden shadow-2xl group text-left">
              <div className="absolute top-0 right-0 w-48 h-48 bg-alloro-orange/5 rounded-full -mr-24 -mt-24 blur-[60px] pointer-events-none group-hover:bg-alloro-orange/10 transition-all duration-700" />
              <div className="relative z-10 flex items-center gap-6">
                <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center border border-white/10 shrink-0">
                  <Shield size={22} className="text-white/60" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-bold leading-snug tracking-tight text-white/90">
                    <span className="text-alloro-orange font-black">
                      Encrypted &amp; Secure.
                    </span>{" "}
                    All patient and practice data is protected by high-level
                    encryption protocols.
                  </p>
                  <div className="flex items-center gap-4 pt-1">
                    <span className="flex items-center gap-1.5 text-[8px] font-black text-white/20 uppercase tracking-[0.2em]">
                      <Lock size={10} /> HIPAA Compliant
                    </span>
                    <span className="flex items-center gap-1.5 text-[8px] font-black text-white/20 uppercase tracking-[0.2em]">
                      <Activity size={10} /> Monitored 24/7
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Restart Product Tour */}
            <button
              type="button"
              className="mt-4 w-full text-left px-4 py-3 rounded-2xl border border-dashed border-slate-200 text-sm font-medium text-slate-400 hover:text-alloro-orange hover:border-alloro-orange/30 transition-all cursor-default"
            >
              Restart Product Tour
            </button>
          </HotspotZone>
        </section>

        {/* Right Column - Locations & Integrations */}
        <section className="xl:col-span-7 space-y-6">
          {/* Google Search Console Section */}
          <HotspotZone
            id="gsc-card"
            hotspot={findHotspot("gsc-card")}
            isActive={activeHotspotId === "gsc-card"}
            onHotspotClick={onHotspotClick}
          >
            <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
              <div className="w-full flex items-center justify-between px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                    <Search size={16} className="text-blue-600" />
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-bold text-alloro-navy">
                      Google Search Console
                    </div>
                    <div className="text-xs text-slate-400">Connected</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700">
                    <CheckCircle2 size={10} /> Connected
                  </span>
                  <ChevronDown size={16} className="text-slate-300" />
                </div>
              </div>
            </div>
          </HotspotZone>

          {/* Locations Section */}
          <HotspotZone
            id="locations-section"
            hotspot={findHotspot("locations-section")}
            isActive={activeHotspotId === "locations-section"}
            onHotspotClick={onHotspotClick}
          >
            <div className="space-y-6">
              {/* Section Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black text-alloro-navy font-heading tracking-tight">
                    Locations
                  </h3>
                  <p className="text-slate-400 text-[12px] mt-1 font-semibold">
                    Manage your business locations and their Google Business
                    Profiles
                  </p>
                </div>
                <button
                  type="button"
                  className="flex items-center gap-2 px-5 py-2.5 text-[10px] font-black uppercase tracking-widest text-white bg-alloro-orange rounded-xl shadow-lg cursor-default"
                >
                  <Plus size={14} />
                  Add Location
                </button>
              </div>

              {/* Location Card */}
              <div className="bg-white rounded-[28px] border border-slate-200 shadow-[0_2px_8px_rgba(0,0,0,0.04)] overflow-hidden">
                <div className="p-6 sm:p-8">
                  {/* Location Header Row */}
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className="p-3 rounded-2xl bg-green-50 flex-shrink-0">
                        <MapPin className="w-5 h-5 text-green-500" />
                      </div>
                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                        <h4 className="text-lg font-black text-alloro-navy font-heading tracking-tight">
                          Smile Clinic - Downtown
                        </h4>
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-amber-50 text-amber-700 border border-amber-200">
                          <Star size={10} className="fill-amber-500" />
                          Primary
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* GBP Info */}
                  <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <p className="text-sm font-bold text-alloro-navy">
                      Smile Clinic - Downtown
                    </p>
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                      Location ID: locations/987654321
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </HotspotZone>
        </section>
      </div>
    </DashboardLayout>
  );
}
