export type IntegrationPlatform = "hubspot" | "rybbit" | "clarity" | "gsc";

export type ActiveIntegration = {
  platform: IntegrationPlatform;
  status: string;
};
