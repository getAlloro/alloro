import type { Dispatch, SetStateAction } from "react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import type {
  WebsiteProjectWithPages,
  WebsitePage,
  BulkSeoStatus,
  LayoutsStatus,
} from "../../../api/websites";
import type { CodeSnippet } from "../../../api/codeSnippets";
import type { useConfirm } from "../../../components/ui/ConfirmModal";
import type { WebsiteDetailTab } from "../websiteDetail.utils";
import CodeManagerTab from "../../../components/Admin/website-tabs/CodeManagerTab";
import MediaTab from "../../../components/Admin/website-tabs/MediaTab";
import RecipientsConfig from "../../../components/Admin/leadgen/RecipientsConfig";
import FormSubmissionsTab from "../../../components/Admin/leadgen/FormSubmissionsTab";
import PostsTab from "../../../components/Admin/website-tabs/PostsTab";
import MenusTab from "../../../components/Admin/website-tabs/MenusTab";
import BackupsTab from "../../../components/Admin/website-tabs/BackupsTab";
import AiCommandTab from "../../../components/Admin/agents/AiCommandTab";
import RedirectsTab from "../../../components/Admin/website-tabs/RedirectsTab";
import ReviewsTab from "../../../components/Admin/website-tabs/ReviewsTab";
import CostsTab from "../../../components/Admin/website-tabs/CostsTab";
import IntegrationsTab from "../../../components/Admin/website-tabs/IntegrationsTab";
import { LayoutsTab } from "./LayoutsTab";
import { PagesTab } from "./PagesTab";

type PageGroup = { path: string; pages: WebsitePage[] };

/**
 * Tab-content render section for WebsiteDetail.
 * Moved verbatim from WebsiteDetail's return body — same JSX, classNames,
 * animation props, strings, and per-tab gating. All locals the markup read
 * are passed through as props.
 */
export function WebsiteDetailTabContent({
  detailTab,
  id,
  website,
  pageGroups,
  allPageSeoMeta,
  isGeneratingPage,
  isLive,
  isInProgress,
  isBulkSeoActive,
  bulkSeoStatus,
  expandedPaths,
  selectedPaths,
  editingName,
  nameInput,
  savingName,
  deletingPageId,
  deletingPagePath,
  confirm,
  invalidateWebsite,
  setWebsiteCache,
  setSelectedPaths,
  setEditingName,
  setNameInput,
  setSavingName,
  setShowFindReplaceModal,
  setShowCreatePageModal,
  togglePath,
  startBulkPageSeo,
  handleCancelGeneration,
  handleDeletePage,
  handleDeletePageVersion,
  layoutsStatus,
  setShowLayoutsModal,
  loadingSnippets,
  codeSnippets,
  loadCodeSnippets,
  pageGenStatuses,
}: {
  detailTab: WebsiteDetailTab;
  id: string | undefined;
  website: WebsiteProjectWithPages;
  pageGroups: PageGroup[];
  allPageSeoMeta: { titles: string[]; descriptions: string[] };
  isGeneratingPage: boolean;
  isLive: boolean;
  isInProgress: boolean;
  isBulkSeoActive: boolean;
  bulkSeoStatus: BulkSeoStatus | null;
  expandedPaths: Set<string>;
  selectedPaths: Set<string>;
  editingName: string | null;
  nameInput: string;
  savingName: string | null;
  deletingPageId: string | null;
  deletingPagePath: string | null;
  confirm: ReturnType<typeof useConfirm>;
  invalidateWebsite: (uuid: string) => Promise<void>;
  setWebsiteCache: (uuid: string, data: WebsiteProjectWithPages) => unknown;
  setSelectedPaths: Dispatch<SetStateAction<Set<string>>>;
  setEditingName: Dispatch<SetStateAction<string | null>>;
  setNameInput: Dispatch<SetStateAction<string>>;
  setSavingName: Dispatch<SetStateAction<string | null>>;
  setShowFindReplaceModal: Dispatch<SetStateAction<boolean>>;
  setShowCreatePageModal: Dispatch<SetStateAction<boolean>>;
  togglePath: (path: string) => void;
  startBulkPageSeo: (paths?: string[]) => Promise<void>;
  handleCancelGeneration: () => void;
  handleDeletePage: (path: string, versionCount: number) => Promise<void>;
  handleDeletePageVersion: (pageId: string, pageGroup: PageGroup) => Promise<void>;
  layoutsStatus: LayoutsStatus | null;
  setShowLayoutsModal: (value: boolean) => void;
  loadingSnippets: boolean;
  codeSnippets: CodeSnippet[];
  loadCodeSnippets: () => void;
  pageGenStatuses: { generation_status: string }[];
}) {
  return (
    <>
      {/* Pages Section — grouped by path, expandable versions */}
      {detailTab === "pages" && (
        <PagesTab
          id={id}
          website={website}
          pageGroups={pageGroups}
          allPageSeoMeta={allPageSeoMeta}
          isGeneratingPage={isGeneratingPage}
          isLive={isLive}
          isInProgress={isInProgress}
          isBulkSeoActive={isBulkSeoActive}
          bulkSeoStatus={bulkSeoStatus}
          expandedPaths={expandedPaths}
          selectedPaths={selectedPaths}
          editingName={editingName}
          nameInput={nameInput}
          savingName={savingName}
          deletingPageId={deletingPageId}
          deletingPagePath={deletingPagePath}
          confirm={confirm}
          invalidateWebsite={invalidateWebsite}
          setWebsiteCache={setWebsiteCache}
          setSelectedPaths={setSelectedPaths}
          setEditingName={setEditingName}
          setNameInput={setNameInput}
          setSavingName={setSavingName}
          setShowFindReplaceModal={setShowFindReplaceModal}
          setShowCreatePageModal={setShowCreatePageModal}
          togglePath={togglePath}
          startBulkPageSeo={startBulkPageSeo}
          handleCancelGeneration={handleCancelGeneration}
          handleDeletePage={handleDeletePage}
          handleDeletePageVersion={handleDeletePageVersion}
        />
      )}

      {/* Layouts Section */}
      {detailTab === "layouts" && (
        <motion.div
          className="space-y-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <LayoutsTab
            id={id}
            layoutsStatus={layoutsStatus}
            onOpenLayoutsModal={() => setShowLayoutsModal(true)}
          />
        </motion.div>
      )}

      {/* Code Manager Section */}
      {detailTab === "code-manager" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          {loadingSnippets ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
            </div>
          ) : (
            <CodeManagerTab
              projectId={id!}
              codeSnippets={codeSnippets}
              onSnippetsChange={loadCodeSnippets}
              isProject={true}
              pages={website.pages}
            />
          )}
        </motion.div>
      )}

      {/* Media Section */}
      {detailTab === "media" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <MediaTab projectId={id!} />
        </motion.div>
      )}

      {/* Form Submissions Section */}
      {detailTab === "form-submissions" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-6"
        >
          {/* Submissions table */}
          <FormSubmissionsTab
            projectId={id!}
            isAdmin
            settingsContent={
              <div className="space-y-5">
                <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <h3 className="mb-3 text-sm font-semibold text-gray-900">
                    Default Recipients
                  </h3>
                  <RecipientsConfig projectId={id!} />
                </div>
              </div>
            }
          />
        </motion.div>
      )}

      {/* Posts Section */}
      {detailTab === "posts" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <PostsTab projectId={id!} templateId={website.template_id} organizationId={website.organization?.id} />
        </motion.div>
      )}

      {/* Menus Section */}
      {detailTab === "menus" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <MenusTab projectId={id!} templateId={website.template_id} />
        </motion.div>
      )}

      {/* Reviews Section */}
      {detailTab === "reviews" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <ReviewsTab projectId={id!} organizationId={website.organization?.id} identity={website.project_identity} />
        </motion.div>
      )}

      {/* Redirects Section */}
      {detailTab === "redirects" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <RedirectsTab projectId={id!} />
        </motion.div>
      )}

      {/* Advanced Tools Section */}
      {detailTab === "advanced-tools" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <AiCommandTab projectId={id!} pages={website.pages} onExecutionComplete={() => invalidateWebsite(id!)} />
        </motion.div>
      )}

      {/* Integrations Section — HubSpot only in v1 */}
      {detailTab === "integrations" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <IntegrationsTab projectId={id!} />
        </motion.div>
      )}

      {/* Backups Section */}
      {detailTab === "backups" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <BackupsTab projectId={id!} projectName={website.display_name || ""} />
        </motion.div>
      )}

      {/* Costs Section — refetches when generation transitions active → idle */}
      {detailTab === "costs" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <CostsTab
            projectId={id!}
            isGenerating={pageGenStatuses.some(
              (p) =>
                p.generation_status === "queued" ||
                p.generation_status === "generating",
            )}
          />
        </motion.div>
      )}
    </>
  );
}
