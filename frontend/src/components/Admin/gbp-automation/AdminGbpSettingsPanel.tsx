import {
  GbpSettingsSection,
  type GbpSettingsSectionProps,
} from "../../dashboard/gbp-automation/GbpSettingsSection";

export type AdminGbpSettingsPanelProps = GbpSettingsSectionProps;

export function AdminGbpSettingsPanel(props: AdminGbpSettingsPanelProps) {
  return <GbpSettingsSection {...props} />;
}
