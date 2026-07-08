import axios from "axios";
import type { MailgunMessage, TransportResult } from "../types";

const MAILGUN_TIMEOUT_MS = 30_000;
const US_API_BASE = "https://api.mailgun.net";

interface MailgunConfig {
  apiKey: string;
  domain: string;
  apiBase: string;
}

function getMailgunConfig(): MailgunConfig {
  return {
    apiKey: process.env.MAILGUN_API_KEY || "",
    domain: process.env.MAILGUN_DOMAIN || "",
    apiBase: process.env.MAILGUN_API_BASE || US_API_BASE,
  };
}

function buildForm(message: MailgunMessage): URLSearchParams {
  const form = new URLSearchParams();
  form.append("from", message.from);
  form.append("to", message.to.join(","));
  if (message.cc?.length) form.append("cc", message.cc.join(","));
  if (message.bcc?.length) form.append("bcc", message.bcc.join(","));
  form.append("subject", message.subject);
  form.append("html", message.html);
  return form;
}

export async function sendViaMailgun(
  message: MailgunMessage
): Promise<TransportResult> {
  const { apiKey, domain, apiBase } = getMailgunConfig();

  if (!apiKey || !domain) {
    return {
      success: false,
      error:
        "Mailgun not configured (MAILGUN_API_KEY / MAILGUN_DOMAIN missing)",
    };
  }

  try {
    const response = await axios.post(
      `${apiBase}/v3/${domain}/messages`,
      buildForm(message).toString(),
      {
        timeout: MAILGUN_TIMEOUT_MS,
        auth: { username: "api", password: apiKey },
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );

    return {
      success: true,
      messageId: response.data?.id,
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
        "Unknown Mailgun error",
      status: axiosErr.response?.status,
    };
  }
}
