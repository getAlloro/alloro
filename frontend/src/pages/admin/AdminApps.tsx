import { useEffect } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronRight, SearchCheck } from "lucide-react";
import { AiSeoAuditAppWorkspace } from "../../components/Admin/ai-seo-audit/AiSeoAuditAppWorkspace";

type AdminAppKey = "ai-seo-audit";

type AdminAppDefinition = {
  key: AdminAppKey;
  name: string;
};

const ADMIN_APPS: AdminAppDefinition[] = [
  {
    key: "ai-seo-audit",
    name: "AI/SEO Audit",
  },
];

const DEFAULT_APP: AdminAppKey = "ai-seo-audit";

function isAdminAppKey(value: string | undefined): value is AdminAppKey {
  return ADMIN_APPS.some((app) => app.key === value);
}

export default function AdminApps() {
  const { appKey } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const selectedApp: AdminAppKey = isAdminAppKey(appKey) ? appKey : DEFAULT_APP;

  // Canonicalize /admin/apps (or an unknown app) to a concrete app path so the
  // URL always reflects the open app and refresh/deep-links resolve cleanly.
  useEffect(() => {
    if (!isAdminAppKey(appKey)) {
      navigate(`/admin/apps/${DEFAULT_APP}${location.search}`, { replace: true });
    }
  }, [appKey, location.search, navigate]);

  const handleSelectApp = (key: AdminAppKey) => {
    if (key !== selectedApp) navigate(`/admin/apps/${key}`);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
      className="space-y-4"
    >
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-black tracking-tight text-alloro-navy">
          Apps
        </h1>
      </header>

      <div className="grid gap-4 xl:grid-cols-[260px_1fr]">
        <section className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
          <div className="space-y-2">
            {ADMIN_APPS.map((app) => {
              const isActive = selectedApp === app.key;
              return (
                <button
                  key={app.key}
                  type="button"
                  onClick={() => handleSelectApp(app.key)}
                  className={`group flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all duration-200 hover:scale-[1.01] ${
                    isActive
                      ? "border-alloro-orange/30 bg-alloro-orange/10 shadow-sm"
                      : "border-gray-200 bg-gray-50 hover:border-alloro-orange/20 hover:bg-white"
                  }`}
                >
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-alloro-navy text-white">
                    <SearchCheck className="h-4 w-4 text-alloro-orange" />
                  </span>
                  <span className="min-w-0 flex-1 text-sm font-black text-alloro-navy">
                    {app.name}
                  </span>
                  <ChevronRight
                    className={`h-4 w-4 shrink-0 transition-transform ${
                      isActive
                        ? "translate-x-0 text-alloro-orange"
                        : "text-gray-400 group-hover:translate-x-0.5"
                    }`}
                  />
                </button>
              );
            })}
          </div>
        </section>

        <section className="min-w-0">
          {selectedApp === "ai-seo-audit" && <AiSeoAuditAppWorkspace />}
        </section>
      </div>
    </motion.div>
  );
}
