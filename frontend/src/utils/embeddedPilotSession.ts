export const PILOT_EMBED_READY_MESSAGE = "alloro:pilot-embed-ready";
export const PILOT_EMBED_TOKEN_MESSAGE = "alloro:pilot-embed-token";
export const PILOT_EMBED_EXPIRED_MESSAGE = "alloro:pilot-embed-expired";
export const PILOT_EMBED_LOGOUT_MESSAGE = "alloro:pilot-embed-logout";

type EmbeddedPilotSession = {
  email?: string | null;
  role?: string | null;
  token: string;
  userId?: number | null;
};

let embeddedPilotSession: EmbeddedPilotSession | null = null;

export const setEmbeddedPilotSession = (
  session: EmbeddedPilotSession
): void => {
  embeddedPilotSession = session;
};

export const clearEmbeddedPilotSession = (): void => {
  embeddedPilotSession = null;
};

export const getEmbeddedPilotSession = (): EmbeddedPilotSession | null =>
  embeddedPilotSession;

export const isEmbeddedPilotSession = (): boolean =>
  Boolean(embeddedPilotSession?.token);

export const updateEmbeddedPilotToken = (token: string): void => {
  if (!embeddedPilotSession) return;
  embeddedPilotSession = { ...embeddedPilotSession, token };
};

export const updateEmbeddedPilotRole = (role: string): void => {
  if (!embeddedPilotSession) return;
  embeddedPilotSession = { ...embeddedPilotSession, role };
};

export const getEmbeddedPilotStorageItem = (key: string): string | null => {
  if (!embeddedPilotSession) return null;

  if (key === "token") return embeddedPilotSession.token;
  if (key === "user_role") return embeddedPilotSession.role ?? "client";

  return null;
};
