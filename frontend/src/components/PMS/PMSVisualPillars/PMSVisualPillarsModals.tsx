import type { PmsKeyDataMonth } from "../../../api/pms";
import { PMSLatestJobEditor } from "../PMSLatestJobEditor";
import { PMSUploadWizardModal } from "../PMSUploadWizardModal";
import { TemplateUploadModal } from "../TemplateUploadModal";
import { DirectUploadModal } from "../DirectUploadModal";
import { PMSManualEntryModal } from "../PMSManualEntryModal";
import { CompareMonthsModal } from "../dashboard/CompareMonthsModal";
import { PmsFileManager } from "../file-manager/PmsFileManager";

interface PMSVisualPillarsModalsProps {
  organizationId?: number | null;
  locationId?: number | null;
  locationName?: string | null;
  domain?: string;
  hasRolePermission: boolean;
  showDashboardProcessingStatus: boolean;
  localProcessing: boolean;
  referralPending: boolean;
  showFileManager: boolean;
  fileManagerInitialMonth: string | null;
  setShowFileManager: (value: boolean) => void;
  setFileManagerInitialMonth: (value: string | null) => void;
  setManualEntryTargetMonth: (value: string | null) => void;
  setShowManualEntry: (value: boolean) => void;
  handleDataEdited: () => Promise<void> | void;
  latestJobId: number | null;
  hasLatestJobRaw: boolean;
  isEditorOpen: boolean;
  latestJobRaw: unknown;
  setIsEditorOpen: (value: boolean) => void;
  handleEditorSaved: () => Promise<void> | void;
  handleConfirmApproval: () => Promise<void> | void;
  showUploadWizard: boolean;
  setShowUploadWizard: (value: boolean) => void;
  handleUploadWizardSuccess: () => Promise<void> | void;
  showTemplateUpload: boolean;
  setShowTemplateUpload: (value: boolean) => void;
  showDirectUpload: boolean;
  setShowDirectUpload: (value: boolean) => void;
  showCompare: boolean;
  setShowCompare: (value: boolean) => void;
  months: PmsKeyDataMonth[];
  showManualEntry: boolean;
  manualEntryTargetMonth: string | null;
}

export function PMSVisualPillarsModals({
  organizationId,
  locationId,
  locationName,
  domain,
  hasRolePermission,
  showDashboardProcessingStatus,
  localProcessing,
  referralPending,
  showFileManager,
  fileManagerInitialMonth,
  setShowFileManager,
  setFileManagerInitialMonth,
  setManualEntryTargetMonth,
  setShowManualEntry,
  handleDataEdited,
  latestJobId,
  hasLatestJobRaw,
  isEditorOpen,
  latestJobRaw,
  setIsEditorOpen,
  handleEditorSaved,
  handleConfirmApproval,
  showUploadWizard,
  setShowUploadWizard,
  handleUploadWizardSuccess,
  showTemplateUpload,
  setShowTemplateUpload,
  showDirectUpload,
  setShowDirectUpload,
  showCompare,
  setShowCompare,
  months,
  showManualEntry,
  manualEntryTargetMonth,
}: PMSVisualPillarsModalsProps) {
  return (
    <>
      {organizationId && locationId && (
        <PmsFileManager
          organizationId={organizationId}
          locationId={locationId}
          locationName={locationName}
          canManage={hasRolePermission}
          isProcessing={showDashboardProcessingStatus || localProcessing || referralPending}
          isOpen={showFileManager}
          initialMonth={fileManagerInitialMonth}
          onClose={() => {
            setShowFileManager(false);
            setFileManagerInitialMonth(null);
          }}
          onUploadClick={(targetMonth) => {
            // Keep the file-manager panel open — the entry modal overlays it
            // (z-[100] over the panel's z-[70]), matching the Edit flow.
            setManualEntryTargetMonth(targetMonth ?? null);
            setShowManualEntry(true);
          }}
          onDataChanged={handleDataEdited}
        />
      )}


      {latestJobId && hasLatestJobRaw && (
        <PMSLatestJobEditor
          isOpen={isEditorOpen}
          jobId={latestJobId}
          initialData={latestJobRaw}
          onClose={() => setIsEditorOpen(false)}
          onSaved={handleEditorSaved}
          onConfirmApproval={handleConfirmApproval}
        />
      )}

      {/* Upload Wizard Modal - for "Not sure?" flow */}
      <PMSUploadWizardModal
        isOpen={showUploadWizard}
        onClose={() => setShowUploadWizard(false)}
        clientId={domain || ""}
        locationId={locationId}
        onSuccess={handleUploadWizardSuccess}
      />

      {/* Template Upload Modal */}
      <TemplateUploadModal
        isOpen={showTemplateUpload}
        onClose={() => setShowTemplateUpload(false)}
        clientId={domain || ""}
        locationId={locationId}
        onSuccess={handleUploadWizardSuccess}
      />

      {/* Direct Upload Modal */}
      <DirectUploadModal
        isOpen={showDirectUpload}
        onClose={() => setShowDirectUpload(false)}
        clientId={domain || ""}
        locationId={locationId}
        onSuccess={handleUploadWizardSuccess}
      />

      {/* Month Comparison Modal */}
      <CompareMonthsModal
        isOpen={showCompare}
        onClose={() => setShowCompare(false)}
        months={months}
        locationId={locationId ?? null}
      />

      {/* Manual Entry Modal */}
      <PMSManualEntryModal
        isOpen={showManualEntry}
        onClose={() => {
          setShowManualEntry(false);
          setManualEntryTargetMonth(null);
        }}
        clientId={domain || ""}
        locationId={locationId}
        locationName={locationName}
        targetMonth={manualEntryTargetMonth}
        onSuccess={handleUploadWizardSuccess}
      />
    </>
  );
}
