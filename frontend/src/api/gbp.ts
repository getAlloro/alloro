import { apiPost, apiGet, unwrap } from "./index";
import type {
  GBPData,
  GBPAIReadyData,
  GBPAccount,
  GBPLocation,
} from "../hooks/useGBP";

// T4 error-contract: these return the unwrapped payload and throw an ApiError
// on failure; GBPContext catches + surfaces the message.

const baseurl = "/gbp";

async function getKeyData(
  accountId: string,
  locationId: string,
): Promise<Partial<GBPData>> {
  return unwrap<Partial<GBPData>>(
    await apiPost({
      path: baseurl + `/getKeyData`,
      passedData: { accountId, locationId },
    }),
  );
}

interface GBPAIReadyDataRequest {
  accountId: string;
  locationId: string;
  startDate?: string;
  endDate?: string;
}

async function getAIReadyData(
  accountId: string,
  locationId: string,
  startDate?: string,
  endDate?: string,
): Promise<GBPAIReadyData> {
  const passedData: GBPAIReadyDataRequest = { accountId, locationId };
  if (startDate) passedData.startDate = startDate;
  if (endDate) passedData.endDate = endDate;

  return unwrap<GBPAIReadyData>(
    await apiPost({
      path: baseurl + `/getAIReadyData`,
      passedData,
    }),
  );
}

async function getAccounts(): Promise<GBPAccount[]> {
  return unwrap<GBPAccount[]>(
    await apiGet({
      path: baseurl + `/diag/accounts`,
    }),
  );
}

async function getLocations(accountName?: string): Promise<GBPLocation[]> {
  const queryParam = accountName
    ? `?accountName=${encodeURIComponent(accountName)}`
    : "";
  return unwrap<GBPLocation[]>(
    await apiGet({
      path: baseurl + `/diag/locations${queryParam}`,
    }),
  );
}

const gbp = {
  getKeyData,
  getAIReadyData,
  getAccounts,
  getLocations,
};

export default gbp;
