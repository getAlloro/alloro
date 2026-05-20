import type { DocPage } from "../../types/docs";
import { TeamMembersReplica } from "../../components/replicas/TeamMembersReplica";

export const settingsUsersPage: DocPage = {
  slug: "settings-users",
  route: "/settings/users",
  title: "Team Members",
  description:
    "The Team Members settings page lets you manage who has access to your Alloro account. Invite new team members, assign roles, and remove users who no longer need access.",
  category: "settings",
  replica: TeamMembersReplica,
  hotspots: [
    {
      id: "invite-btn",
      x: 24,
      y: 17,
      width: 70,
      height: 12,
      label: "Invite Team Member",
      description: "Click to open the invite modal. Enter an email address and select a role — the invited user will receive an email to accept and set their password.",
      action: "Click",
      step: 1,
    },
    {
      id: "user-list",
      x: 24,
      y: 35,
      width: 70,
      height: 6,
      label: "User List",
      description: "All users with access to this Alloro account are listed here, with their name, email, role, and last active date.",
      step: 2,
    },
    {
      id: "role-selector",
      x: 24,
      y: 35,
      width: 70,
      height: 6,
      label: "Role Selector",
      description: "Change a user's role using the dropdown. Available roles are Admin (full access) and Member (read-only with limited actions).",
      action: "Select",
      step: 3,
    },
    {
      id: "remove-user",
      x: 24,
      y: 35,
      width: 70,
      height: 6,
      label: "Remove User",
      description: "Click to revoke a user's access. They will be immediately signed out and cannot log in until re-invited.",
      action: "Click",
      step: 4,
    },
  ],
  steps: [
    {
      number: 1,
      title: "Invite a new team member",
      description: "Click Invite Team Member, enter their email address, choose their role, and send. They'll receive an invitation email to complete setup.",
      hotspotId: "invite-btn",
    },
    {
      number: 2,
      title: "Review your team",
      description: "The user list shows everyone with access. Review periodically to ensure only current team members have active accounts.",
      hotspotId: "user-list",
    },
    {
      number: 3,
      title: "Change a user's role",
      description: "Use the role dropdown on any user row to promote or restrict their access. Changes take effect immediately on their next page load.",
      hotspotId: "role-selector",
    },
    {
      number: 4,
      title: "Remove a user",
      description: "If someone has left the practice or no longer needs access, click Remove to revoke their login immediately.",
      hotspotId: "remove-user",
    },
  ],
  changelog: [
    {
      version: "0.0.82",
      date: "May 2026",
      summary: "Initial documentation baseline for the Team Members settings page.",
    },
  ],
};
