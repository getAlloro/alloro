import { resolveOrgType, type OrgType } from "../../constants/orgLabels";
import { useAuth } from "../../hooks/useAuth";
import type { ColumnRole } from "../../api/pms/mapping";

export type PmsSampleRow = {
  date: string;
  group: string;
  source: string;
  amount: string;
};

export type PmsCopy = {
  dataName: string;
  dataNameLower: string;
  datasetName: string;
  datasetNameLower: string;
  systemName: string;
  exportName: string;
  reportName: string;
  fileNoun: string;
  fileNounLower: string;
  filesNoun: string;
  uploadDataCta: string;
  uploadYourDataCta: string;
  uploadNewDataCta: string;
  uploadCompletedTemplateTitle: string;
  directUploadTitle: string;
  directUploadSubtitle: string;
  templateDownloadName: string;
  templateHeaders: string;
  templateExample: string;
  toastReceivedTitle: string;
  toastDataReceivedTitle: string;
  toastParsedTitle: string;
  processingMessage: string;
  processingInsightsMessage: string;
  dashboardTitle: string;
  dashboardSubtitle: string;
  dashboardDataEyebrow: string;
  emptyTitle: string;
  emptyProcessingCopy: string;
  emptyReadyCopy: string;
  emptyStartTitle: string;
  emptyNeedsPropertiesCopy: string;
  emptyFlowCopy: string;
  secureBadge: string;
  setupSubtitle: string;
  setupUploadTitle: string;
  setupUploadDescription: string;
  processedBannerTitle: string;
  retrieveErrorTitle: string;
  insightsSubject: string;
  ingestionTitle: string;
  ingestionBody: string;
  restrictedNeedsPropertiesCopy: string;
  restrictedRoleCopy: string;
  sourceLabel: string;
  sourcesLabel: string;
  sourceFieldLabel: string;
  sourcePlaceholder: string;
  sourceHelpText: string;
  dateHelpText: string;
  sourceCountLabel: string;
  sourceTypeLabel: string;
  countSingular: string;
  countPlural: string;
  countShort: string;
  countSummaryLabel: string;
  directSummaryLabel: string;
  partnerSummaryLabel: string;
  directTypeLabel: string;
  partnerTypeLabel: string;
  directLegendLabel: string;
  partnerLegendLabel: string;
  customerIdLabel: string;
  customerIdColumnLabel: string;
  customerIdHelpText: string;
  moneyLabel: string;
  moneyLower: string;
  moneyHelpText: string;
  roleLabels: Record<ColumnRole, string>;
  sampleReportLabel: string;
  sampleHeaders: {
    date: string;
    group: string;
    source: string;
    amount: string;
  };
  sampleRows: PmsSampleRow[];
  manualEntryTitle: string;
  manualEntrySubtitle: string;
  validationMissingSourceData: string;
  previewLocationRequired: string;
  previewUnsupportedSingleFile: string;
  previewUploadOneFile: string;
  topSourcesEyebrow: string;
  topSourcesTitle: string;
  topSourcesEmptyProcessing: string;
  topSourcesEmpty: string;
  allSourcesTitle: string;
  sourceSearchPlaceholder: string;
  sourcePercentageLabel: string;
  sourceCountAbbrev: string;
  mixEyebrow: string;
  mixTitle: string;
  mixObservedLabel: string;
  mixEmptyProcessing: string;
  mixEmpty: string;
  trendEyebrow: string;
  trendEmptyProcessing: string;
  trendEmpty: string;
  paceTitle: string;
  velocityEmptyProcessing: string;
  velocityEmpty: string;
  managerAriaLabel: string;
  managerEyebrow: string;
  managerTitleFallback: string;
  managerTitleSuffix: string;
  managerProcessingCopy: string;
  fileListEmptyMonthPrefix: string;
  fileListEmptyFallback: string;
  fileDeleteConfirm: string;
  fileDeletedTitle: string;
  fileDeletedBody: string;
  historyFallbackFile: string;
  editorOriginalTitle: string;
  editorFileTitle: string;
  editorCurrentSubtitle: string;
  viewerTitle: string;
  viewerSubtitle: string;
  noRecordsFound: string;
  demoExecutiveSummary: string[];
  demoPartnerSourceNames: string[];
  demoDirectCustomerSource: string;
  demoTopFixes: string[];
};

const PMS_COPY: Record<OrgType, PmsCopy> = {
  health: {
    dataName: "PMS Data",
    dataNameLower: "PMS data",
    datasetName: "PMS dataset",
    datasetNameLower: "PMS dataset",
    systemName: "PMS",
    exportName: "PMS export",
    reportName: "Referral Report",
    fileNoun: "PMS file",
    fileNounLower: "PMS file",
    filesNoun: "PMS files",
    uploadDataCta: "Upload PMS data",
    uploadYourDataCta: "Upload Your PMS Data",
    uploadNewDataCta: "Upload New Data",
    uploadCompletedTemplateTitle: "Upload Completed Template",
    directUploadTitle: "Direct Upload",
    directUploadSubtitle: "Upload your PMS export directly",
    templateDownloadName: "referral_report_template.csv",
    templateHeaders: "Treatment Date,Source,Type,Production",
    templateExample: "01/15/2025,Google,self,1500",
    toastReceivedTitle: "PMS file received!",
    toastDataReceivedTitle: "Data received!",
    toastParsedTitle: "PMS file parsed",
    processingMessage:
      "We're processing your PMS data now. We'll notify you once it's ready.",
    processingInsightsMessage: "Processing your insights now...",
    dashboardTitle: "Referral Intelligence",
    dashboardSubtitle:
      "See which channels and doctor relationships drive referrals, production, and your next best growth moves.",
    dashboardDataEyebrow: "Revenue Attribution",
    emptyTitle: "Your PMS intelligence will live here",
    emptyProcessingCopy:
      "Your first PMS dataset is being processed. The dashboard will populate automatically when Alloro finishes analysis.",
    emptyReadyCopy:
      "Upload your first PMS dataset and Alloro will turn it into production trends, referral mix, source rankings, and growth actions.",
    emptyStartTitle: "Start with PMS data",
    emptyNeedsPropertiesCopy:
      "Connect your Google Business Profile before uploading PMS data.",
    emptyFlowCopy:
      "The existing PMS upload and manual entry flow stays unchanged.",
    secureBadge: "HIPAA secure",
    setupSubtitle: "Complete these two steps to unlock your practice insights",
    setupUploadTitle: "Upload Your PMS Data",
    setupUploadDescription:
      "Once properties are connected, upload your practice management data to see referral analytics and revenue attribution.",
    processedBannerTitle: "Your PMS data is processed.",
    retrieveErrorTitle: "Unable to retrieve PMS data.",
    insightsSubject: "referral",
    ingestionTitle: "Update your referral data",
    ingestionBody:
      "Upload your latest month's referral and production numbers. Re-upload a month you've already saved to overwrite its existing entry.",
    restrictedNeedsPropertiesCopy:
      "Connect your Google Business Profile before updating PMS data.",
    restrictedRoleCopy: "Only admins and managers can upload PMS data.",
    sourceLabel: "Referral Source",
    sourcesLabel: "Referral Sources",
    sourceFieldLabel: "Source",
    sourcePlaceholder: "Enter source name...",
    sourceHelpText:
      "Which column shows where each patient came from? (referring practice, doctor, or marketing channel)",
    dateHelpText: "Which column has the visit or appointment date?",
    sourceCountLabel: "Referrals Count",
    sourceTypeLabel: "Referral Type",
    countSingular: "referral",
    countPlural: "referrals",
    countShort: "refs",
    countSummaryLabel: "Total Referrals",
    directSummaryLabel: "Self Referrals",
    partnerSummaryLabel: "Doctor Referrals",
    directTypeLabel: "self",
    partnerTypeLabel: "doctor",
    directLegendLabel: "Self",
    partnerLegendLabel: "Doctor",
    customerIdLabel: "Patient ID or Name",
    customerIdColumnLabel: "Patient ID column (optional)",
    customerIdHelpText:
      "When provided, multiple procedures for the same patient on the same day count as ONE referral. Leave empty if your data is already at one-row-per-referral.",
    moneyLabel: "Production",
    moneyLower: "production",
    moneyHelpText:
      "How should we calculate the dollar amount per row? Pick one column or build a formula by adding/subtracting columns.",
    roleLabels: {
      date: "Date of Visit",
      source: "Referral Source",
      referring_practice: "Referring Practice / Doctor",
      referring_doctor: "Referring Doctor (extra)",
      patient: "Patient ID or Name",
      type: "Referral Type",
      status: "Visit Status",
      production_gross: "Amount Billed",
      production_net: "Amount Collected",
      production_total: "Production (already summed)",
      writeoffs: "Writeoffs / Adjustments",
      ignore: "(Don't use this column)",
    },
    sampleReportLabel: "Example Report Format",
    sampleHeaders: {
      date: "Referral Date",
      group: "Referring Practice",
      source: "Referring Source",
      amount: "Production",
    },
    sampleRows: [
      {
        date: "1/1/26",
        group: "Sample Medical Practice",
        source: "Dr. Sarah Lewis",
        amount: "$180",
      },
      {
        date: "1/2/26",
        group: "Self Referral",
        source: "Google",
        amount: "$220",
      },
      {
        date: "1/3/26",
        group: "Self Referral",
        source: "Website",
        amount: "$150",
      },
      {
        date: "1/4/26",
        group: "Sample Medical Practice",
        source: "Dr. James Patel",
        amount: "$190",
      },
    ],
    manualEntryTitle: "Enter PMS Data",
    manualEntrySubtitle: "Add your referral and production data",
    validationMissingSourceData:
      "Please add at least one source with referrals or production data",
    previewLocationRequired: "Choose a location before uploading PMS data.",
    previewUnsupportedSingleFile:
      "Upload one PMS file at a time so overwrite checks stay clear.",
    previewUploadOneFile:
      "Upload one PMS file at a time so overwrite checks stay clear.",
    topSourcesEyebrow: "Referral Sources",
    topSourcesTitle: "Ranked by production",
    topSourcesEmptyProcessing:
      "Your ranked referral sources will appear once PMS processing finishes.",
    topSourcesEmpty: "Upload PMS data to rank referral sources.",
    allSourcesTitle: "All referral sources",
    sourceSearchPlaceholder: "Search sources...",
    sourcePercentageLabel: "% of production",
    sourceCountAbbrev: "refs",
    mixEyebrow: "Referral mix",
    mixTitle: "Where your referrals come from",
    mixObservedLabel: "referrals observed",
    mixEmptyProcessing:
      "Your referral mix will appear here once PMS processing finishes.",
    mixEmpty: "Your referral mix will appear here after PMS data is uploaded.",
    trendEyebrow: "Production trend",
    trendEmptyProcessing:
      "Your production trend will appear once PMS processing finishes.",
    trendEmpty: "Upload PMS data to see production trends.",
    paceTitle: "Monthly referral pace",
    velocityEmptyProcessing:
      "Your referral velocity will appear once PMS processing finishes.",
    velocityEmpty: "Upload PMS data to see referral velocity.",
    managerAriaLabel: "PMS file manager",
    managerEyebrow: "PMS File Manager",
    managerTitleFallback: "PMS Files",
    managerTitleSuffix: "PMS Files",
    managerProcessingCopy:
      "PMS processing is running for this location. File edits are paused until it finishes.",
    fileListEmptyMonthPrefix: "No PMS data saved for",
    fileListEmptyFallback: "No PMS files saved yet",
    fileDeleteConfirm: "Remove this PMS file from active reporting?",
    fileDeletedTitle: "PMS file deleted",
    fileDeletedBody:
      "Removed from active reporting. Use Get updated insights to refresh.",
    historyFallbackFile: "PMS file",
    editorOriginalTitle: "Original Parsed PMS Data",
    editorFileTitle: "Edit PMS File Data",
    editorCurrentSubtitle: "Current parsed PMS data",
    viewerTitle: "View PMS Data",
    viewerSubtitle: "Review referral and production data",
    noRecordsFound: "No PMS records found.",
    demoExecutiveSummary: [
      "Marketing referrals show strong growth trajectory",
      "Doctor referral network expanding steadily",
      "Overall conversion rates above industry average",
    ],
    demoPartnerSourceNames: [
      "Dr. Sarah Johnson",
      "Dr. Michael Chen",
      "Dr. Emily Davis",
      "Dr. Robert Wilson",
    ],
    demoDirectCustomerSource: "Patient Referral",
    demoTopFixes: [
      "Increase follow-up on Google Search leads to improve conversion",
      "Implement patient referral program incentives",
      "Optimize Facebook ad targeting for higher quality leads",
    ],
  },
  generic: {
    dataName: "Revenue Data",
    dataNameLower: "revenue data",
    datasetName: "revenue dataset",
    datasetNameLower: "revenue dataset",
    systemName: "revenue system",
    exportName: "revenue report",
    reportName: "Revenue Report",
    fileNoun: "revenue file",
    fileNounLower: "revenue file",
    filesNoun: "revenue files",
    uploadDataCta: "Upload revenue data",
    uploadYourDataCta: "Upload Your Revenue Data",
    uploadNewDataCta: "Upload New Data",
    uploadCompletedTemplateTitle: "Upload Completed Template",
    directUploadTitle: "Direct Upload",
    directUploadSubtitle: "Upload your revenue report directly",
    templateDownloadName: "revenue_report_template.csv",
    templateHeaders: "Transaction Date,Source,Type,Revenue",
    templateExample: "01/15/2025,Google,direct,1500",
    toastReceivedTitle: "Revenue file received!",
    toastDataReceivedTitle: "Revenue data received!",
    toastParsedTitle: "Revenue file parsed",
    processingMessage:
      "We're processing your revenue data now. We'll notify you once it's ready.",
    processingInsightsMessage: "Processing your insights now...",
    dashboardTitle: "Revenue Intelligence",
    dashboardSubtitle:
      "See which channels drive records, revenue, and your next best growth moves.",
    dashboardDataEyebrow: "Revenue Attribution",
    emptyTitle: "Your revenue intelligence will live here",
    emptyProcessingCopy:
      "Your first revenue dataset is being processed. The dashboard will populate automatically when Alloro finishes analysis.",
    emptyReadyCopy:
      "Upload your first revenue dataset and Alloro will turn it into revenue trends, source rankings, and growth actions.",
    emptyStartTitle: "Start with revenue data",
    emptyNeedsPropertiesCopy:
      "Connect your Google Business Profile before uploading revenue data.",
    emptyFlowCopy:
      "The existing revenue upload and manual entry flow stays unchanged.",
    secureBadge: "Secure upload",
    setupSubtitle: "Complete these two steps to unlock your business insights",
    setupUploadTitle: "Upload Your Revenue Data",
    setupUploadDescription:
      "Once properties are connected, upload your revenue data to see source analytics and revenue attribution.",
    processedBannerTitle: "Your revenue data is processed.",
    retrieveErrorTitle: "Unable to retrieve revenue data.",
    insightsSubject: "records",
    ingestionTitle: "Update your revenue data",
    ingestionBody:
      "Upload your latest month's revenue numbers. Re-upload a month you've already saved to overwrite its existing entry.",
    restrictedNeedsPropertiesCopy:
      "Connect your Google Business Profile before updating revenue data.",
    restrictedRoleCopy: "Only admins and managers can upload revenue data.",
    sourceLabel: "Source / Channel",
    sourcesLabel: "Revenue Sources",
    sourceFieldLabel: "Source / Channel",
    sourcePlaceholder: "Enter source or channel...",
    sourceHelpText:
      "Which column groups revenue by source or channel? (campaign, partner, location, service line, or other source)",
    dateHelpText: "Which column has the revenue or transaction date?",
    sourceCountLabel: "Records Count",
    sourceTypeLabel: "Source Type",
    countSingular: "record",
    countPlural: "records",
    countShort: "records",
    countSummaryLabel: "Total Records",
    directSummaryLabel: "Direct Records",
    partnerSummaryLabel: "Partner-Sourced Records",
    directTypeLabel: "direct",
    partnerTypeLabel: "partner",
    directLegendLabel: "Direct",
    partnerLegendLabel: "Partner",
    customerIdLabel: "Customer ID or Name",
    customerIdColumnLabel: "Customer ID column (optional)",
    customerIdHelpText:
      "When provided, multiple rows for the same customer on the same day count as one record. Leave empty if your data is already one row per record.",
    moneyLabel: "Revenue",
    moneyLower: "revenue",
    moneyHelpText:
      "How should we calculate the revenue amount per row? Pick one column or build a formula by adding/subtracting columns.",
    roleLabels: {
      date: "Date",
      source: "Source / Channel",
      referring_practice: "Source / Channel",
      referring_doctor: "Contact / Campaign (extra)",
      patient: "Customer ID or Name",
      type: "Source Type",
      status: "Record Status",
      production_gross: "Amount Billed",
      production_net: "Amount Collected",
      production_total: "Revenue (already summed)",
      writeoffs: "Discounts / Adjustments",
      ignore: "(Don't use this column)",
    },
    sampleReportLabel: "Example Report Format",
    sampleHeaders: {
      date: "Revenue Date",
      group: "Source / Channel",
      source: "Source Detail",
      amount: "Revenue",
    },
    sampleRows: [
      {
        date: "1/1/26",
        group: "Google Ads",
        source: "Search campaign",
        amount: "$180",
      },
      {
        date: "1/2/26",
        group: "Website",
        source: "Booking form",
        amount: "$220",
      },
      {
        date: "1/3/26",
        group: "Walk-in",
        source: "Direct visit",
        amount: "$150",
      },
      {
        date: "1/4/26",
        group: "Partner",
        source: "Local partner",
        amount: "$190",
      },
    ],
    manualEntryTitle: "Enter Revenue Data",
    manualEntrySubtitle: "Add your source and revenue data",
    validationMissingSourceData:
      "Please add at least one source with records or revenue data",
    previewLocationRequired: "Choose a location before uploading revenue data.",
    previewUnsupportedSingleFile:
      "Upload one revenue file at a time so overwrite checks stay clear.",
    previewUploadOneFile:
      "Upload one revenue file at a time so overwrite checks stay clear.",
    topSourcesEyebrow: "Revenue Sources",
    topSourcesTitle: "Ranked by revenue",
    topSourcesEmptyProcessing:
      "Your ranked revenue sources will appear once processing finishes.",
    topSourcesEmpty: "Upload revenue data to rank revenue sources.",
    allSourcesTitle: "All revenue sources",
    sourceSearchPlaceholder: "Search revenue sources...",
    sourcePercentageLabel: "% of revenue",
    sourceCountAbbrev: "records",
    mixEyebrow: "Source mix",
    mixTitle: "Where your records come from",
    mixObservedLabel: "records observed",
    mixEmptyProcessing:
      "Your source mix will appear here once processing finishes.",
    mixEmpty:
      "Your source mix will appear here after revenue data is uploaded.",
    trendEyebrow: "Revenue trend",
    trendEmptyProcessing:
      "Your revenue trend will appear once processing finishes.",
    trendEmpty: "Upload revenue data to see revenue trends.",
    paceTitle: "Monthly record pace",
    velocityEmptyProcessing:
      "Your record velocity will appear once processing finishes.",
    velocityEmpty: "Upload revenue data to see record velocity.",
    managerAriaLabel: "Revenue data manager",
    managerEyebrow: "Revenue Manager",
    managerTitleFallback: "Revenue Files",
    managerTitleSuffix: "Revenue Files",
    managerProcessingCopy:
      "Revenue processing is running for this location. File edits are paused until it finishes.",
    fileListEmptyMonthPrefix: "No revenue data saved for",
    fileListEmptyFallback: "No revenue files saved yet",
    fileDeleteConfirm: "Remove this revenue file from active reporting?",
    fileDeletedTitle: "Revenue file deleted",
    fileDeletedBody:
      "Removed from active reporting. Use Get updated insights to refresh.",
    historyFallbackFile: "revenue file",
    editorOriginalTitle: "Original Parsed Revenue Data",
    editorFileTitle: "Edit Revenue File Data",
    editorCurrentSubtitle: "Current parsed revenue data",
    viewerTitle: "View Revenue Data",
    viewerSubtitle: "Review source and revenue data",
    noRecordsFound: "No revenue records found.",
    demoExecutiveSummary: [
      "Direct sources show strong revenue growth",
      "Partner source network is expanding steadily",
      "Overall conversion rates are above benchmark",
    ],
    demoPartnerSourceNames: [
      "Community Partner A",
      "Sales Partner B",
      "Event Partner C",
      "Affiliate Partner D",
    ],
    demoDirectCustomerSource: "Returning Customer",
    demoTopFixes: [
      "Increase follow-up on Google Ads records to improve conversion",
      "Build a returning-customer campaign",
      "Optimize Facebook ad targeting for higher value records",
    ],
  },
};

export function getPmsCopy(orgType: OrgType): PmsCopy {
  return PMS_COPY[orgType];
}

export function getPmsCopyForValue(value: string | null | undefined): PmsCopy {
  return getPmsCopy(resolveOrgType(value));
}

export function usePmsCopy(): PmsCopy {
  const { userProfile } = useAuth();
  return getPmsCopyForValue(userProfile?.organizationType);
}

export function formatPmsSourceType(copy: PmsCopy, value: string): string {
  if (value === "self") return copy.directTypeLabel;
  if (value === "doctor") return copy.partnerTypeLabel;
  return value;
}
