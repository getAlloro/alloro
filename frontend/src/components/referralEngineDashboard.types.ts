// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface ReferralEngineData {
  executive_summary?: string[];
  growth_opportunity_summary?: {
    top_three_fixes?: (TopFix | string)[];
    estimated_additional_annual_revenue?: number;
  };
  doctor_referral_matrix?: DoctorReferral[];
  non_doctor_referral_matrix?: NonDoctorReferral[];
  alloro_automation_opportunities?: (ReferralAutomationOpportunity | string)[];
  practice_action_plan?: (ReferralPracticeAction | string)[];
  observed_period?: {
    start_date: string;
    end_date: string;
  };
  data_quality_flags?: string[];
  confidence?: number;
}

export interface TopFix {
  title: string;
  description: string;
  impact?: string;
}

export interface ReferralAutomationOpportunity {
  title: string;
  description: string;
  priority?: string;
  impact?: string;
  effort?: string;
  category?: string;
  due_date?: string;
}

export interface ReferralPracticeAction {
  title: string;
  description: string;
  priority?: string;
  impact?: string;
  effort?: string;
  category?: string;
  owner?: string;
  due_date?: string;
}

export interface DoctorReferral {
  referrer_name?: string;
  referred?: number;
  net_production?: number | null;
  avg_production_per_referral?: number | null;
  trend_label?: "increasing" | "decreasing" | "new" | "dormant" | "stable";
  notes?: string;
}

export interface NonDoctorReferral {
  source_label?: string;
  source_key?: string;
  source_type?: "digital" | "patient" | "other";
  referred?: number;
  net_production?: number | null;
  avg_production_per_referral?: number | null;
  trend_label?: "increasing" | "decreasing" | "new" | "dormant" | "stable";
  notes?: string;
}

export interface ReferralEngineDashboardProps {
  data?: ReferralEngineData;
  organizationId?: number | null;
  locationId?: number | null;
  hideHeader?: boolean;
}

export interface PMSTrendMonth {
  month: string;
  year: number;
  selfReferrals: number;
  doctorReferrals: number;
  total: number;
}
