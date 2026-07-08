import { OrganizationUserModel } from "../../../models/OrganizationUserModel";
import { InvitationModel } from "../../../models/InvitationModel";
import { OrganizationModel } from "../../../models/OrganizationModel";
import { sendEmail } from "../../../emails/emailService";
import {
  generateInvitationToken,
  calculateTokenExpiry,
} from "../feature-utils/util.invitation-token";
import logger from "../../../lib/logger";

export async function listOrganizationUsers(organizationId: number) {
  if (!organizationId) {
    const error = new Error("Missing organization ID") as any;
    error.statusCode = 400;
    error.body = { error: "Missing organization ID" };
    throw error;
  }

  const users = await OrganizationUserModel.listUsersForOrg(organizationId);
  const invitations = await InvitationModel.listPendingByOrgWithSelect(organizationId);

  return { users, invitations };
}

export async function inviteUserToOrganization(
  organizationId: number,
  email: string,
  role: string | undefined,
  inviterRole: string | undefined
) {
  if (!email) {
    const error = new Error("Email is required") as any;
    error.statusCode = 400;
    error.body = { error: "Email is required" };
    throw error;
  }

  // Managers can only invite managers and viewers, not admins
  if (inviterRole === "manager" && role === "admin") {
    const error = new Error("Managers cannot invite admins") as any;
    error.statusCode = 403;
    error.body = { error: "Managers cannot invite admins" };
    throw error;
  }

  if (!organizationId) {
    const error = new Error("Organization not found") as any;
    error.statusCode = 404;
    error.body = { error: "Organization not found" };
    throw error;
  }

  // Check if user is already in the organization
  const existingMember = await OrganizationUserModel.findByOrgAndEmail(
    organizationId,
    email
  );

  if (existingMember) {
    const error = new Error(
      "User is already a member of this organization"
    ) as any;
    error.statusCode = 400;
    error.body = { error: "User is already a member of this organization" };
    throw error;
  }

  // Check if invitation already exists
  const existingInvite = await InvitationModel.findPendingByOrgAndEmail(
    organizationId,
    email
  );

  if (existingInvite) {
    const error = new Error("Invitation already sent to this email") as any;
    error.statusCode = 400;
    error.body = { error: "Invitation already sent to this email" };
    throw error;
  }

  // Create invitation
  const token = generateInvitationToken();
  const expiresAt = calculateTokenExpiry(7);

  await InvitationModel.create({
    email: email.toLowerCase(),
    organization_id: organizationId,
    role: role || "viewer",
    token,
    expires_at: expiresAt,
    status: "pending",
    created_at: new Date(),
    updated_at: new Date(),
  });

  // Get organization name for email
  const organization = await OrganizationModel.findById(organizationId);
  const organizationName = organization?.name || "the organization";

  // Send invitation email
  const encodedEmail = encodeURIComponent(email.toLowerCase());
  const signupUrl =
    process.env.NODE_ENV === "production"
      ? `https://app.getalloro.com/signup?email=${encodedEmail}`
      : `http://localhost:5174/signup?email=${encodedEmail}`;

  const assignedRole = role || "viewer";

  const emailResult = await sendEmail({
    category: "account",
    subject: `You've been invited to join ${organizationName} on Alloro`,
    body: `
      <div style="font-family: sans-serif; padding: 20px; max-width: 600px;">
        <h2 style="color: #1a1a1a;">You've been invited to Alloro</h2>
        <p style="color: #4a5568; font-size: 16px;">
          You've been invited to join <strong>${organizationName}</strong> on Alloro with the role of <strong>${assignedRole}</strong>.
        </p>
        <p style="color: #4a5568; font-size: 16px;">
          Alloro helps you track and optimize your online presence with data-driven insights.
        </p>
        <div style="margin: 30px 0;">
          <a href="${signupUrl}"
             style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 500;">
            Create Your Account
          </a>
        </div>
        <p style="color: #718096; font-size: 14px;">
          Click the button above to create your account and join <strong>${organizationName}</strong>.
        </p>
        <p style="color: #718096; font-size: 14px; margin-top: 20px;">
          If you didn't expect this invitation, you can safely ignore this email.
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
        <p style="color: #a0aec0; font-size: 12px;">
          This invitation was sent by Alloro on behalf of ${organizationName}.
        </p>
      </div>
    `,
    recipients: [email.toLowerCase()],
  });

  if (!emailResult.success) {
    logger.warn(`[Settings] Failed to send invitation email to ${email}`);
  } else {
    logger.info(`[Settings] Invitation email sent to ${email}`);
  }

  return { message: `Invitation sent to ${email}` };
}

export async function resendInvitation(
  organizationId: number,
  invitationId: number
) {
  if (!organizationId) {
    const error = new Error("Organization not found") as any;
    error.statusCode = 404;
    throw error;
  }

  if (isNaN(invitationId)) {
    const error = new Error("Invalid invitation ID") as any;
    error.statusCode = 400;
    throw error;
  }

  // Find the invitation and verify it belongs to this org
  const invite = await InvitationModel.findById(invitationId);

  if (!invite || invite.organization_id !== organizationId) {
    const error = new Error("Invitation not found") as any;
    error.statusCode = 404;
    throw error;
  }

  if (invite.status !== "pending") {
    const error = new Error("Invitation is no longer pending") as any;
    error.statusCode = 400;
    throw error;
  }

  // Regenerate token and extend expiry
  const token = generateInvitationToken();
  const expiresAt = calculateTokenExpiry(7);

  await InvitationModel.updateById(invitationId, {
    token,
    expires_at: expiresAt,
    updated_at: new Date(),
  });

  // Send invitation email
  const organization = await OrganizationModel.findById(organizationId);
  const organizationName = organization?.name || "the organization";

  const encodedEmail = encodeURIComponent(invite.email);
  const signupUrl =
    process.env.NODE_ENV === "production"
      ? `https://app.getalloro.com/signup?email=${encodedEmail}`
      : `http://localhost:5174/signup?email=${encodedEmail}`;

  const emailResult = await sendEmail({
    category: "account",
    subject: `You've been invited to join ${organizationName} on Alloro`,
    body: `
      <div style="font-family: sans-serif; padding: 20px; max-width: 600px;">
        <h2 style="color: #1a1a1a;">You've been invited to Alloro</h2>
        <p style="color: #4a5568; font-size: 16px;">
          You've been invited to join <strong>${organizationName}</strong> on Alloro with the role of <strong>${invite.role}</strong>.
        </p>
        <p style="color: #4a5568; font-size: 16px;">
          Alloro helps you track and optimize your online presence with data-driven insights.
        </p>
        <div style="margin: 30px 0;">
          <a href="${signupUrl}"
             style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 500;">
            Create Your Account
          </a>
        </div>
        <p style="color: #718096; font-size: 14px;">
          Click the button above to create your account and join <strong>${organizationName}</strong>.
        </p>
        <p style="color: #718096; font-size: 14px; margin-top: 20px;">
          If you didn't expect this invitation, you can safely ignore this email.
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
        <p style="color: #a0aec0; font-size: 12px;">
          This invitation was sent by Alloro on behalf of ${organizationName}.
        </p>
      </div>
    `,
    recipients: [invite.email],
  });

  if (!emailResult.success) {
    logger.warn(`[Settings] Failed to resend invitation email to ${invite.email}`);
  } else {
    logger.info(`[Settings] Invitation email resent to ${invite.email}`);
  }

  return { message: `Invitation resent to ${invite.email}` };
}

export async function removeUserFromOrganization(
  organizationId: number,
  userIdToRemove: number,
  requesterId: number
) {
  if (isNaN(userIdToRemove)) {
    const error = new Error("Invalid user ID") as any;
    error.statusCode = 400;
    error.body = { error: "Invalid user ID" };
    throw error;
  }

  if (!organizationId) {
    const error = new Error("Organization not found") as any;
    error.statusCode = 404;
    error.body = { error: "Organization not found" };
    throw error;
  }

  // Check requester's role
  const requester = await OrganizationUserModel.findByUserAndOrg(
    requesterId,
    organizationId
  );

  if (!requester || requester.role !== "admin") {
    const error = new Error("Only admins can remove users") as any;
    error.statusCode = 403;
    error.body = { error: "Only admins can remove users" };
    throw error;
  }

  // Prevent removing yourself
  if (requesterId === userIdToRemove) {
    const error = new Error("You cannot remove yourself") as any;
    error.statusCode = 400;
    error.body = { error: "You cannot remove yourself" };
    throw error;
  }

  // Remove user
  await OrganizationUserModel.deleteByUserAndOrg(userIdToRemove, organizationId);

  return { message: "User removed from organization" };
}

export async function updateUserRole(
  organizationId: number,
  userIdToUpdate: number,
  newRole: string,
  requesterId: number | undefined
) {
  if (isNaN(userIdToUpdate)) {
    const error = new Error("Invalid user ID") as any;
    error.statusCode = 400;
    error.body = { error: "Invalid user ID" };
    throw error;
  }

  if (!["admin", "manager", "viewer"].includes(newRole)) {
    const error = new Error("Invalid role") as any;
    error.statusCode = 400;
    error.body = { error: "Invalid role" };
    throw error;
  }

  if (!organizationId) {
    const error = new Error("Organization not found") as any;
    error.statusCode = 404;
    error.body = { error: "Organization not found" };
    throw error;
  }

  // Prevent changing own role
  if (requesterId === userIdToUpdate) {
    const error = new Error("You cannot change your own role") as any;
    error.statusCode = 400;
    error.body = { error: "You cannot change your own role" };
    throw error;
  }

  // Update role
  const updated = await OrganizationUserModel.updateRole(
    userIdToUpdate,
    organizationId,
    newRole
  );

  if (!updated) {
    const error = new Error("User not found in organization") as any;
    error.statusCode = 404;
    error.body = { error: "User not found in organization" };
    throw error;
  }

  return {
    message: `Role updated to ${newRole}. User will need to log in again.`,
  };
}
