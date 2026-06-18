import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  Loader2,
  AlertCircle,
  MessageSquare,
  Dna,
  GraduationCap,
  Briefcase,
  Heart,
  ChevronLeft,
} from "lucide-react";
import {
  TabBar,
} from "../../components/ui/DesignSystem";
import { MindChatTab } from "../../components/Admin/minds/MindChatTab";
import { MindSettingsTab } from "../../components/Admin/minds/MindSettingsTab";
import { KnowledgeSyncWizard } from "../../components/Admin/minds/KnowledgeSyncWizard";
import { MindWorkplaceTab } from "../../components/Admin/minds/MindWorkplaceTab";
import { MindParentingTab } from "../../components/Admin/minds/MindParentingTab";
import { getMind, type MindWithVersion } from "../../api/minds";

type TabKey = "chat" | "settings" | "knowledge-sync" | "parenting" | "workplace";

function buildTabs(mindName: string): Array<{
  id: TabKey;
  label: string;
  description: string;
  icon: React.ReactNode;
}> {
  return [
    {
      id: "chat",
      label: `Talk to ${mindName}`,
      description: "Have a conversation and test its knowledge",
      icon: <MessageSquare className="h-4 w-4" />,
    },
    {
      id: "settings",
      label: "Agent Anatomy",
      description: "Personality, brain, sources, and versions",
      icon: <Dna className="h-4 w-4" />,
    },
    {
      id: "knowledge-sync",
      label: "Agent University",
      description: `Where ${mindName} learns new things`,
      icon: <GraduationCap className="h-4 w-4" />,
    },
    {
      id: "parenting",
      label: "Agent Parenting",
      description: `Teach ${mindName} directly through conversation`,
      icon: <Heart className="h-4 w-4" />,
    },
    {
      id: "workplace",
      label: "Agent Workplace",
      description: `Where ${mindName} punches in and gets to work`,
      icon: <Briefcase className="h-4 w-4" />,
    },
  ];
}

export default function MindDetail() {
  const { mindId } = useParams<{ mindId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get("tab") || "chat") as TabKey;

  const [mind, setMind] = useState<MindWithVersion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Full-dark body when on minds page
  useEffect(() => {
    document.body.classList.add("minds-page-active");
    return () => document.body.classList.remove("minds-page-active");
  }, []);

  const fetchMind = useCallback(async () => {
    if (!mindId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getMind(mindId);
      if (data) {
        setMind(data);
      } else {
        setError("Mind not found");
      }
    } catch {
      setError("Failed to load mind");
    } finally {
      setLoading(false);
    }
  }, [mindId]);

  useEffect(() => {
    fetchMind();
  }, [fetchMind]);

  const handleTabChange = (tabId: string) => {
    setSearchParams({ tab: tabId });
  };

  const handleMindUpdated = () => {
    fetchMind();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !mind) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertCircle className="h-8 w-8 text-red-400 mb-2" />
        <p className="text-sm text-red-600">{error || "Mind not found"}</p>
        <button
          onClick={() => navigate("/admin/minds")}
          className="mt-3 text-sm text-alloro-orange hover:underline"
        >
          Back to Minds
        </button>
      </div>
    );
  }

  const tabs = buildTabs(mind.name);

  return (
    <div className="minds-theme">
      <div className="minds-microdots" />
      <div className="relative z-[1]">
      <button
        onClick={() => navigate("/admin/minds")}
        className="flex items-center gap-1 text-sm text-[#6a6a75] hover:text-[#eaeaea] transition-colors mb-4"
      >
        <ChevronLeft className="h-4 w-4" />
        Minds
      </button>
      <div className="mb-6">
        <TabBar
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={handleTabChange}
        />
      </div>

      {activeTab === "chat" && <MindChatTab mindId={mind.id} mindName={mind.name} />}

      {activeTab === "settings" && (
        <MindSettingsTab
          mind={mind}
          onMindUpdated={handleMindUpdated}
          onMindDeleted={() => navigate("/admin/minds")}
        />
      )}

      {activeTab === "knowledge-sync" && (
        <KnowledgeSyncWizard mindId={mind.id} mindName={mind.name} />
      )}

      {activeTab === "parenting" && (
        <MindParentingTab mindId={mind.id} mindName={mind.name} />
      )}

      {activeTab === "workplace" && (
        <MindWorkplaceTab
          mindId={mind.id}
          mindName={mind.name}
          mindSlug={mind.slug}
          hasPublishedVersion={!!mind.published_version_id}
          rejectionCategories={mind.rejection_categories}
        />
      )}

      </div>
    </div>
  );
}
