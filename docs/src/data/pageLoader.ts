import type { DocPage } from "../types/docs";
import { signinPage } from "./pages/signin";
import { signupPage } from "./pages/signup";
import { forgotPasswordPage } from "./pages/forgot-password";
import { practiceHubPage } from "./pages/practice-hub";
import { referralsHubPage } from "./pages/referrals-hub";
import { localRankingsPage } from "./pages/local-rankings";
import { todoListPage } from "./pages/todo-list";
import { notificationsPage } from "./pages/notifications";
import { settingsIntegrationsPage } from "./pages/settings-integrations";
import { settingsUsersPage } from "./pages/settings-users";
import { settingsBillingPage } from "./pages/settings-billing";
import { settingsAccountPage } from "./pages/settings-account";
import { websitePage } from "./pages/website";
import { supportPage } from "./pages/support";

const PAGE_DATA: Record<string, DocPage> = {
  signin: signinPage,
  signup: signupPage,
  "forgot-password": forgotPasswordPage,
  "practice-hub": practiceHubPage,
  "referrals-hub": referralsHubPage,
  "local-rankings": localRankingsPage,
  "todo-list": todoListPage,
  notifications: notificationsPage,
  "settings-integrations": settingsIntegrationsPage,
  "settings-users": settingsUsersPage,
  "settings-billing": settingsBillingPage,
  "settings-account": settingsAccountPage,
  website: websitePage,
  support: supportPage,
};

export function getDocPageData(slug: string): DocPage | null {
  return PAGE_DATA[slug] ?? null;
}
