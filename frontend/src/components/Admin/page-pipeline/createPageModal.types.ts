export interface CreatePageModalProps {
  projectId: string;
  templateId?: string;
  gbpData: Record<string, string | number | null> | null;
  defaultPlaceId: string;
  defaultWebsiteUrl: string;
  defaultPrimaryColor?: string;
  defaultAccentColor?: string;
  onSuccess: () => void;
  onBlankPageCreated?: (pageId: string) => void;
  onClose: () => void;
}

export type CreateMode = "template" | "blank" | "artifact";
