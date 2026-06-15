import { apiPost, unwrap } from "./index";
import type { ClarityData, ClarityAIReadyData } from "../hooks/useClarity";

// T4 error-contract: these throw an ApiError on failure (via unwrap) and
// return the unwrapped payload; ClarityContext catches + surfaces the message.

const baseurl = "/clarity";

async function getKeyData(domain: string): Promise<Partial<ClarityData>> {
  return unwrap<Partial<ClarityData>>(
    await apiPost({
      path: baseurl + `/getKeyData`,
      passedData: { clientId: domain },
    }),
  );
}

async function getAIReadyData(clientId: string): Promise<ClarityAIReadyData> {
  return unwrap<ClarityAIReadyData>(
    await apiPost({
      path: baseurl + `/getAIReadyData`,
      passedData: { clientId },
    }),
  );
}

const clarity = {
  getKeyData,
  getAIReadyData,
};

export default clarity;
