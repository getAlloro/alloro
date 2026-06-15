import {
  fetchWebsiteDetail,
  connectDomain,
  verifyDomainAdmin,
  disconnectDomain,
} from "../../../api/websites";
import type {
  WebsiteProjectWithPages,
  LayoutsStatus,
  DynamicSlotDef,
} from "../../../api/websites";
import IdentityModal from "../../../components/Admin/identity/IdentityModal";
import LayoutInputsModal from "../../../components/Admin/page-pipeline/LayoutInputsModal";
import CreatePageModal from "../../../components/Admin/page-pipeline/CreatePageModal";
import FindReplaceModal from "../../../components/Admin/find-replace/FindReplaceModal";
import ConnectDomainModal from "../../../components/Admin/website-tabs/ConnectDomainModal";

/**
 * Modal cluster for WebsiteDetail (Identity, Layout Inputs, Create Page,
 * Find & Replace, Connect Domain). Moved verbatim from WebsiteDetail's return
 * body — identical JSX, gating, inline handlers, and strings. Parent state,
 * setters, the page-count ref, and callbacks are passed through as props.
 */
export function WebsiteDetailModals({
  website,
  id,
  gbpData,
  showIdentityModal,
  showLayoutsModal,
  showCreatePageModal,
  showFindReplaceModal,
  showDomainModal,
  layoutsStatus,
  layoutSlots,
  layoutSlotValues,
  loadingLayoutSlots,
  startingLayouts,
  customDomain,
  domainVerifiedAt,
  setShowIdentityModal,
  setShowLayoutsModal,
  setShowCreatePageModal,
  setShowFindReplaceModal,
  setShowDomainModal,
  setWebsite,
  setIsGeneratingPage,
  expectedPageCountRef,
  navigate,
  invalidateWebsite,
  updateLayoutSlotValue,
  handleStartLayouts,
  handleCancelLayouts,
  startPageGenerationPoll,
}: {
  website: WebsiteProjectWithPages;
  id: string | undefined;
  gbpData: Record<string, string | number | null> | null;
  showIdentityModal: boolean;
  showLayoutsModal: boolean;
  showCreatePageModal: boolean;
  showFindReplaceModal: boolean;
  showDomainModal: boolean;
  layoutsStatus: LayoutsStatus | null;
  layoutSlots: DynamicSlotDef[];
  layoutSlotValues: Record<string, string>;
  loadingLayoutSlots: boolean;
  startingLayouts: boolean;
  customDomain: string | null;
  domainVerifiedAt: string | null;
  setShowIdentityModal: (value: boolean) => void;
  setShowLayoutsModal: (value: boolean) => void;
  setShowCreatePageModal: (value: boolean) => void;
  setShowFindReplaceModal: (value: boolean) => void;
  setShowDomainModal: (value: boolean) => void;
  setWebsite: (data: WebsiteProjectWithPages) => void;
  setIsGeneratingPage: (value: boolean) => void;
  expectedPageCountRef: React.MutableRefObject<number>;
  navigate: (path: string) => void;
  invalidateWebsite: (uuid: string) => Promise<void>;
  updateLayoutSlotValue: (key: string, value: string) => void;
  handleStartLayouts: () => void;
  handleCancelLayouts: () => void;
  startPageGenerationPoll: () => void;
}) {
  return (
    <>
      {/* Identity Modal */}
      {showIdentityModal && website && (
        <IdentityModal
          projectId={website.id}
          onClose={() => setShowIdentityModal(false)}
          onIdentityChanged={async () => {
            const res = await fetchWebsiteDetail(website.id);
            if (res.success) setWebsite(res.data);
          }}
        />
      )}

      {/* Layout Inputs Modal */}
      <LayoutInputsModal
        open={showLayoutsModal}
        onClose={() => setShowLayoutsModal(false)}
        status={layoutsStatus}
        slots={layoutSlots}
        values={layoutSlotValues}
        onSlotChange={updateLayoutSlotValue}
        loadingSlots={loadingLayoutSlots}
        startingLayouts={startingLayouts}
        onGenerate={handleStartLayouts}
        onCancel={handleCancelLayouts}
      />


      {/* Create Page Modal */}
      {showCreatePageModal && (
        <CreatePageModal
          projectId={website.id}
          templateId={website.template_id || undefined}
          gbpData={gbpData}
          defaultPlaceId={website.selected_place_id || ""}
          defaultWebsiteUrl={website.selected_website_url || ""}
          defaultPrimaryColor={website.primary_color || "#1E40AF"}
          defaultAccentColor={website.accent_color || "#F59E0B"}
          onSuccess={() => {
            setShowCreatePageModal(false);
            setIsGeneratingPage(true);
            expectedPageCountRef.current = website.pages.length;
            startPageGenerationPoll();
          }}
          onBlankPageCreated={(pageId) => {
            setShowCreatePageModal(false);
            navigate(`/admin/websites/${website.id}/pages/${pageId}/edit`);
          }}
          onClose={() => setShowCreatePageModal(false)}
        />
      )}

      {/* Site-wide Find & Replace Modal */}
      <FindReplaceModal
        projectId={website.id}
        isOpen={showFindReplaceModal}
        onClose={() => setShowFindReplaceModal(false)}
        onApplied={() => {
          if (id) invalidateWebsite(id);
        }}
      />

      {/* Custom Domain Modal */}
      {website && (
        <ConnectDomainModal
          isOpen={showDomainModal}
          onClose={() => setShowDomainModal(false)}
          projectId={website.id}
          currentDomain={customDomain}
          domainVerifiedAt={domainVerifiedAt}
          onDomainChange={async () => {
            const res = await fetchWebsiteDetail(website.id);
            if (res.success) setWebsite(res.data);
          }}
          onConnect={async (domain) => {
            const res = await connectDomain(website.id, domain);
            return res.data;
          }}
          onVerify={async () => {
            const res = await verifyDomainAdmin(website.id);
            return res.data;
          }}
          onDisconnect={async () => {
            await disconnectDomain(website.id);
          }}
        />
      )}
    </>
  );
}
