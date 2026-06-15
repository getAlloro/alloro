import { apiGet, unwrap } from "./index";

// T4 error-contract: getOAuthUrl returns the unwrapped payload and throws an
// ApiError on failure; GoogleConnectButton catches + surfaces the message.
// (Dead validateToken/disconnectAccount removed — zero consumers.)

const baseurl = "/auth/google";

interface OAuthUrlResponse {
  authUrl?: string;
}

async function getOAuthUrl(): Promise<OAuthUrlResponse> {
  return unwrap<OAuthUrlResponse>(await apiGet({ path: baseurl }));
}

const googleAuth = {
  getOAuthUrl,
};

export default googleAuth;
