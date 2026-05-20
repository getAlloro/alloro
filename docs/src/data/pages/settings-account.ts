import type { DocPage } from "../../types/docs";
import { AccountReplica } from "../../components/replicas/AccountReplica";

export const settingsAccountPage: DocPage = {
  slug: "settings-account",
  route: "/settings/account",
  title: "Account Settings",
  description:
    "The Account Settings page lets you update your personal profile information — your name, email address, and other account preferences. Changes here affect how you appear in the system and how Alloro contacts you.",
  category: "settings",
  replica: AccountReplica,
  hotspots: [
    {
      id: "profile-fields",
      x: 24,
      y: 17,
      width: 38,
      height: 48,
      label: "Name Fields",
      description: "Update your first and last name. These appear in team listings and are used in email communications from Alloro.",
      action: "Type",
      step: 1,
    },
    {
      id: "email-field",
      x: 26,
      y: 40,
      width: 34,
      height: 6,
      label: "Email Address",
      description: "Your login email address. Changing this will update your sign-in credential — you'll need to verify the new address before it takes effect.",
      action: "Type",
      step: 2,
    },
    {
      id: "save-btn",
      x: 26,
      y: 58,
      width: 34,
      height: 6,
      label: "Save Changes",
      description: "Click to save any changes made to your profile. If you've changed your email, a verification link will be sent to the new address.",
      action: "Click",
      step: 3,
    },
  ],
  steps: [
    {
      number: 1,
      title: "Update your name",
      description: "Edit your first or last name in the name fields. Your updated name will appear across the platform immediately after saving.",
      hotspotId: "profile-fields",
    },
    {
      number: 2,
      title: "Update your email",
      description: "Enter a new email address if you need to change your login. A verification email will be sent before the change goes live.",
      hotspotId: "email-field",
    },
    {
      number: 3,
      title: "Save your changes",
      description: "Click Save Changes to apply your updates. If no changes were made, the button will be inactive.",
      hotspotId: "save-btn",
    },
  ],
  changelog: [
    {
      version: "0.0.82",
      date: "May 2026",
      summary: "Initial documentation baseline for the Account Settings page.",
    },
  ],
};
