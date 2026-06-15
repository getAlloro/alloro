export type DeviceMode = "desktop" | "tablet" | "mobile";

export interface SchemaField {
  name: string;
  slug: string;
  type: string;
  required: boolean;
  default_value: unknown;
  options?: string[];
}

export interface PostBlocksTabProps {
  templateId: string;
  wrapper: string;
  header: string;
  footer: string;
}
