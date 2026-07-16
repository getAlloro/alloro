import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../emails/emailService", () => ({
  sendEmail: vi.fn(),
  getAdminEmails: vi.fn(() => ["admin@test.alloro"]),
}));

import { sendEmail } from "../emails/emailService";
import {
  buildInvitationEmail,
  buildPasswordResetEmail,
  buildTemporaryPasswordEmail,
  buildVerificationCodeEmail,
} from "../emails/templates/AccountEmailTemplates";
import {
  buildLocationLifecycleEmail,
  buildQuantityUpdateEmail,
  type LocationLifecycleEmailKind,
} from "../emails/templates/BillingEmailTemplates";
import { buildSystemTestEmail } from "../emails/templates/SystemTestEmail";
import { buildUserNotificationEmail } from "../emails/templates/UserSendNotification";
import {
  BRAND_COLORS,
  EMAIL_FONT_STACKS,
  LOGO_URL,
  createButton,
  createCodeCard,
  wrapInBaseTemplate,
} from "../emails/templates/base";
import { buildCheckupResultContent } from "../emails/templates/CheckupResultEmail";
import { sendWebsiteResolvedEmail } from "../controllers/support/support-services/SupportEmailService";
import type { UserNotificationData } from "../emails/types";
import type { SupportTicket } from "../models/SupportTicketModel";

const mockedSendEmail = vi.mocked(sendEmail);

function expectSharedShell(html: string): void {
  expect(html).toContain("<!DOCTYPE html>");
  expect(html).toContain(LOGO_URL);
  expect(html).toContain('width="600" class="container"');
  expect(html).toContain(EMAIL_FONT_STACKS.display);
  expect(html).toContain(EMAIL_FONT_STACKS.body);
  expect(html).toContain(EMAIL_FONT_STACKS.code);
  expect(html).toContain(BRAND_COLORS.orange);
  expect(html.toLowerCase()).not.toContain("#2563eb");
}

describe("Alloro transactional email branding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedSendEmail.mockResolvedValue({
      success: true,
      messageId: "synthetic-message-id",
      timestamp: "2026-07-16T00:00:00.000Z",
    });
  });

  it("applies the shared shell, font stacks, orange CTA, and escaping", () => {
    const content = `
      <h1>Serif heading</h1>
      ${createCodeCard("Code <label>", '12<34&"')}
      ${createButton("Open <Alloro>", 'https://app.test/path?x="<tag>"&y=1')}
    `;
    const html = wrapInBaseTemplate(content, {
      preheader: "Preview <unsafe> & text",
    });

    expectSharedShell(html);
    expect(html).toContain("Preview &lt;unsafe&gt; &amp; text");
    expect(html).toContain("Code &lt;label&gt;");
    expect(html).toContain("12&lt;34&amp;&quot;");
    expect(html).toContain("Open &lt;Alloro&gt;");
    expect(html).toContain(
      'href="https://app.test/path?x=&quot;&lt;tag&gt;&quot;&amp;y=1"',
    );
  });

  it("renders every account and authentication variant from the shared system", () => {
    const invitation = buildInvitationEmail({
      organizationName: "<script>Dental & Co</script>",
      role: 'viewer & "owner"',
      signupUrl: "https://app.test/signup?email=doctor@example.com&role=viewer",
    });
    const verification = buildVerificationCodeEmail({ code: '12<34&"' });
    const reset = buildPasswordResetEmail({ code: "987654" });
    const temporaryPassword = buildTemporaryPasswordEmail({
      userName: "Dr. <Admin>",
      tempPassword: 'Safe<&"Pass9',
      appUrl: "https://app.test",
    });

    for (const html of [
      invitation,
      verification,
      reset,
      temporaryPassword,
    ]) {
      expectSharedShell(html);
    }

    expect(invitation).toContain(
      "&lt;script&gt;Dental &amp; Co&lt;/script&gt;",
    );
    expect(invitation).not.toContain("<script>Dental");
    expect(invitation).toContain("viewer &amp; &quot;owner&quot;");
    expect(invitation).toContain("Create Your Account");
    expect(verification).toContain("This code will expire in 10 minutes.");
    expect(verification).toContain("12&lt;34&amp;&quot;");
    expect(reset).toContain("This code will expire in 30 minutes.");
    expect(temporaryPassword).toContain("Dr. &lt;Admin&gt;");
    expect(temporaryPassword).toContain("Safe&lt;&amp;&quot;Pass9");
    expect(temporaryPassword).toContain("https://app.test/settings");
  });

  it("renders quantity and lifecycle billing variants without raw dynamic HTML", () => {
    const quantity = buildQuantityUpdateEmail({
      organizationName: "<script>Practice & Partners</script>",
      direction: "added",
      oldQuantity: 1,
      newQuantity: 2,
      unitPrice: "299",
      newTotal: "598",
    });
    const lifecycleKinds: LocationLifecycleEmailKind[] = [
      "cancel_scheduled",
      "cancelled_immediately",
      "subscription_ending",
      "reopened",
    ];
    const lifecycleEmails = lifecycleKinds.map((kind) =>
      buildLocationLifecycleEmail({
        locationName: "North <script>Clinic</script> & Co",
        kind,
        effectiveDate: "July 31, 2026",
      }),
    );

    expectSharedShell(quantity);
    expect(quantity).toContain(
      "&lt;script&gt;Practice &amp; Partners&lt;/script&gt;",
    );
    expect(quantity).toContain("Previous: <strong>1</strong> location × $299/mo");
    expect(quantity).toContain("New monthly total: $598/mo");

    for (const html of lifecycleEmails) {
      expectSharedShell(html);
      expect(html).toContain("North &lt;script&gt;Clinic&lt;/script&gt; &amp; Co");
      expect(html).not.toContain("<script>Clinic");
    }
  });

  it("renders the system transport test with safe diagnostic values", () => {
    const html = buildSystemTestEmail({
      transport: "mailgun <primary>",
      recipient: 'dave+"test"@example.com',
      sentAt: "2026-07-16T07:04:48.756Z",
    });

    expectSharedShell(html);
    expect(html).toContain("mailgun &lt;primary&gt;");
    expect(html).toContain("dave+&quot;test&quot;@example.com");
    expect(html).toContain("2026-07-16T07:04:48.756Z");
  });

  it("renders all notification types and escapes metadata keys and values", () => {
    const notificationTypes: UserNotificationData["notificationType"][] = [
      "pms_job_ready",
      "ranking_complete",
      "monthly_report",
      "task_update",
      "system",
    ];

    for (const notificationType of notificationTypes) {
      const html = buildUserNotificationEmail({
        recipientEmail: "synthetic@example.com",
        recipientName: "Dr. <Viewer>",
        notificationType,
        title: "Update <script>alert(1)</script>",
        message: "Complete <img src=x onerror=alert(1)>",
        actionLabel: "Open <Dashboard>",
        actionUrl: 'https://app.test/dashboard?tab="tasks"&view=all',
        metadata: {
          "patient_<script>": "<img src=x onerror=alert(1)>",
          total_count: 1200,
          is_ready: true,
          completed_at: new Date("2026-07-16T00:00:00.000Z"),
          omitted_value: null,
        },
      }).body;

      expectSharedShell(html);
      expect(html).toContain("Dr. &lt;Viewer&gt;");
      expect(html).toContain("Update &lt;script&gt;alert(1)&lt;/script&gt;");
      expect(html).toContain("Complete &lt;img src=x onerror=alert(1)&gt;");
      expect(html).toContain("Patient &lt;script&gt;");
      expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
      expect(html).toContain("1,200");
      expect(html).toContain("Yes");
      expect(html).toContain("Open &lt;Dashboard&gt;");
      expect(html).not.toContain("<script>alert(1)</script>");
      expect(html).not.toContain("<img src=x onerror=alert(1)>");
    }
  });

  it("keeps representative support and checkup emails on the shared shell", async () => {
    const ticket: SupportTicket = {
      id: "00000000-0000-4000-8000-000000000001",
      public_id: "WEB-0011",
      organization_id: 1,
      location_id: null,
      created_by_user_id: 1,
      assigned_to_user_id: null,
      type: "website_edit",
      status: "resolved",
      severity: "low",
      priority: "p2",
      category: null,
      target_sprint: null,
      title: "Update profile",
      current_page_url: null,
      requested_completion_date: null,
      guided_answers: {},
      internal_notes: null,
      resolution_notes: "Marking as complete",
      ack_email_sent_at: null,
      resolved_email_sent_at: null,
      resolved_at: "2026-07-16T00:00:00.000Z",
      created_at: "2026-07-15T00:00:00.000Z",
      updated_at: "2026-07-16T00:00:00.000Z",
    };

    await sendWebsiteResolvedEmail({
      ticket,
      recipientEmail: "synthetic@example.com",
      recipientName: "Dr. Test",
    });
    const supportPayload = mockedSendEmail.mock.calls[0]?.[0];
    expect(supportPayload).toBeDefined();
    if (!supportPayload) throw new Error("Support email was not built");
    expectSharedShell(supportPayload.body);

    const checkupHtml = wrapInBaseTemplate(
      buildCheckupResultContent({
        recipientEmail: "synthetic@example.com",
        practiceName: "Synthetic Dental",
        city: "Test City",
        compositeScore: 72,
        topCompetitorName: "Sample Orthodontics",
        topCompetitorReviews: 200,
        practiceReviews: 125,
        finding: "Synthetic finding for local rendering only.",
        rank: 3,
        totalCompetitors: 10,
      }),
      { preheader: "Synthetic checkup preview" },
    );
    expectSharedShell(checkupHtml);
  });
});
