import axios from "axios";
import type { TransportResult } from "../types";

const N8N_TIMEOUT_MS = 30_000;

export interface N8nPayload {
  subject: string;
  body: string;
  recipients: string[];
  cc: string[];
  bcc: string[];
  from: string;
  fromName: string;
}

export async function sendViaN8n(
  webhookUrl: string,
  payload: N8nPayload
): Promise<TransportResult> {
  if (!webhookUrl) {
    return {
      success: false,
      error: "ALLORO_EMAIL_SERVICE_WEBHOOK not configured",
    };
  }

  try {
    const response = await axios.post(webhookUrl, payload, {
      timeout: N8N_TIMEOUT_MS,
      headers: { "Content-Type": "application/json" },
    });

    const messageId =
      response.data?.id ?? response.data?.messageId ?? undefined;

    return {
      success: true,
      messageId,
      status: response.status,
    };
  } catch (error: unknown) {
    const axiosErr = error as {
      response?: { data?: { message?: string }; status?: number };
      message?: string;
    };
    return {
      success: false,
      error:
        axiosErr.response?.data?.message ||
        axiosErr.message ||
        "Unknown n8n error",
      status: axiosErr.response?.status,
    };
  }
}
