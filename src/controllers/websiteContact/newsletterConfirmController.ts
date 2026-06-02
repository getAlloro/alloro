/**
 * Newsletter Confirmation Controller
 *
 * Public GET endpoint: /api/websites/confirm-newsletter?token=uuid
 *
 * Validates the token, confirms the signup, persists to form_submissions,
 * emails the site owner, and redirects to the site's /confirmed page.
 */

import { Request, Response } from "express";
import { NewsletterSignupModel } from "../../models/website-builder/NewsletterSignupModel";
import { ProjectModel } from "../../models/website-builder/ProjectModel";
import { FormSubmissionModel } from "../../models/website-builder/FormSubmissionModel";
import { sendEmailWebhook } from "./websiteContact-services/emailWebhookService";
import { getSiteUrl } from "./websiteContact-services/newsletterConfirmationService";
import { resolveRecipients } from "../../services/recipientSettingsService";

const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function handleNewsletterConfirm(req: Request, res: Response): Promise<void> {
  const { token } = req.query;

  if (!token || typeof token !== "string") {
    res.redirect("https://getalloro.com");
    return;
  }

  const signup = await NewsletterSignupModel.findByToken(token);

  if (!signup) {
    res.redirect("https://getalloro.com");
    return;
  }

  const project = await ProjectModel.findPublicActiveById(signup.project_id);
  const siteUrl = project
    ? getSiteUrl(project.hostname, project.custom_domain)
    : "https://getalloro.com";

  if (!project) {
    res.redirect(siteUrl);
    return;
  }

  // Already confirmed — redirect to confirmed page
  if (signup.confirmed_at) {
    res.redirect(`${siteUrl}/opt-in-confirmed`);
    return;
  }

  // Token expired (24h)
  const age = Date.now() - new Date(signup.created_at).getTime();
  if (age > TOKEN_EXPIRY_MS) {
    res.redirect(`${siteUrl}`);
    return;
  }

  // Confirm the signup
  await NewsletterSignupModel.confirm(signup.id);

  // Resolve recipients for the site owner notification
  let recipients: string[] = [];
  if (project) {
    try {
      const resolution = await resolveRecipients({
        organizationId: project.organization_id,
        channel: "website_form",
        legacyProjectRecipients: project.recipients,
      });
      recipients = resolution.recipients;
    } catch (err) {
      console.error("[Newsletter Confirm] Recipient lookup failed:", err);
    }
  }

  // Persist to form_submissions so it shows in the dashboard
  try {
    await FormSubmissionModel.create({
      project_id: signup.project_id,
      form_name: "Newsletter Signup",
      contents: { Email: signup.email },
      recipients_sent_to: recipients,
    });
  } catch (err) {
    console.error("[Newsletter Confirm] Failed to save submission:", err);
  }

  // Email site owner
  const primaryColor = project?.primary_color || "#0e8988";

  const emailBody = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
    <div style="background:${primaryColor};color:#fff;padding:24px 32px;border-radius:16px 16px 0 0;">
      <h1 style="margin:0;font-size:22px;">New Confirmed Newsletter Subscriber</h1>
    </div>
    <div style="background:#f9fafb;padding:24px 32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 16px 16px;">
      <table style="width:100%;border-collapse:collapse;font-size:15px;">
        <tr>
          <td style="padding:8px 12px 8px 0;color:#6b7280;vertical-align:top;white-space:nowrap;">Email</td>
          <td style="padding:8px 0;color:#111827;font-weight:600;">${signup.email}</td>
        </tr>
      </table>
      <p style="color:#6b7280;font-size:13px;margin-top:16px;">
        This subscriber confirmed their email address via double opt-in.
      </p>
    </div>
    <p style="margin-top:16px;font-size:12px;color:#9ca3af;text-align:center;">Via Newsletter Signup form</p>
  </div>`;

  try {
    if (recipients.length === 0) {
      console.warn(
        `[Newsletter Confirm] No recipients resolved for project ${signup.project_id}; saved subscriber without sending owner email.`
      );
      res.redirect(`${siteUrl}/opt-in-confirmed`);
      return;
    }

    const fromEmail = process.env.CONTACT_FORM_FROM || "info@getalloro.com";
    await sendEmailWebhook({
      cc: [],
      bcc: [],
      body: emailBody,
      from: fromEmail,
      subject: "New Confirmed Newsletter Subscriber",
      fromName: "Alloro Sites",
      recipients,
    });
  } catch (err) {
    console.error("[Newsletter Confirm] Failed to send notification email:", err);
  }

  // Redirect to confirmed page
  res.redirect(`${siteUrl}/opt-in-confirmed`);
}
