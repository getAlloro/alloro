import type { ReactNode } from "react";

export type DashboardAlertVariant = "stale" | "nudge" | "setup";

export type DashboardAlertAction = {
  label: string;
  /** Click handler (use this OR `to`). */
  onClick?: () => void;
  /** Router destination (use this OR `onClick`). */
  to?: string;
  /** Shows a spinner and disables the action while true. */
  loading?: boolean;
};

export type DashboardAlertModel = {
  id: string;
  /** Higher number = higher priority = shown on top of the stack. */
  priority: number;
  variant: DashboardAlertVariant;
  eyebrow: string;
  title: string;
  body: string;
  action?: DashboardAlertAction;
  icon?: ReactNode;
};
