/**
 * Form Detection Service
 *
 * Derives the website-side form catalog from existing submissions and current
 * page/template markup. There is no separate "forms" source of truth in this
 * schema; form names and field shapes are observed from runtime artifacts.
 * Visual-only labels/order are layered on from form catalog preferences.
 *
 * Used by the Integrations UI so customers can see which forms exist on their
 * site (and what fields each one collects) BEFORE creating a HubSpot mapping.
 */

import { flattenSubmissionContents } from "../../../utils/formContentsFlattener";
import {
  FormSubmissionModel,
} from "../../../models/website-builder/FormSubmissionModel";
import { PageModel } from "../../../models/website-builder/PageModel";
import { ProjectModel } from "../../../models/website-builder/ProjectModel";
import { TemplatePageModel } from "../../../models/website-builder/TemplatePageModel";
import {
  FormRecipientRuleModel,
  type IFormRecipientRule,
} from "../../../models/website-builder/FormRecipientRuleModel";
import {
  FormCatalogPreferenceModel,
  type IFormCatalogPreference,
} from "../../../models/website-builder/FormCatalogPreferenceModel";
import {
  NEWSLETTER_FORM_NAME,
  normalizeFormDisplayName,
  normalizeFormKey,
} from "../../../utils/formName";

export interface DetectedForm {
  form_name: string;
  submission_count: number;
  last_seen: Date | null;
  unread_count: number;
}

export interface FieldShapeEntry {
  key: string;
  occurrence_count: number;
  sample_value: string | null;
}

export interface FormCatalogItem {
  form_name: string;
  form_key: string;
  display_label: string | null;
  sort_order: number | null;
  submission_count: number;
  last_seen: Date | null;
  unread_count: number;
  sources: {
    submissions: boolean;
    markup: boolean;
  };
  rule: {
    id: string;
    recipients: string[];
    is_enabled: boolean;
    updated_at: Date;
  } | null;
}

const DATA_FORM_NAME_REGEX =
  /data-form-name\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;

/**
 * List distinct form names for a project, with submission counts and last-seen
 * timestamps. Newsletter signups are excluded — they're a separate flow with
 * double-opt-in and are explicitly out of scope for HubSpot mapping in v1.
 */
export async function listDetectedForms(projectId: string): Promise<DetectedForm[]> {
  return FormSubmissionModel.listDetectedFormStats(projectId, [
    NEWSLETTER_FORM_NAME,
  ]);
}

function addCatalogItem(
  forms: Map<string, FormCatalogItem>,
  formName: string,
  source: "submissions" | "markup",
  stats?: {
    submission_count: number;
    last_seen: Date | null;
    unread_count: number;
  },
): void {
  const displayName = normalizeFormDisplayName(formName);
  if (!displayName || displayName === NEWSLETTER_FORM_NAME) return;

  const formKey = normalizeFormKey(displayName);
  const existing = forms.get(formKey);
  if (existing) {
    existing.sources[source] = true;
    if (stats) {
      existing.submission_count = stats.submission_count;
      existing.last_seen = stats.last_seen;
      existing.unread_count = stats.unread_count;
      existing.form_name = displayName;
    }
    return;
  }

  forms.set(formKey, {
    form_name: displayName,
    form_key: formKey,
    display_label: null,
    sort_order: null,
    submission_count: stats?.submission_count ?? 0,
    last_seen: stats?.last_seen ?? null,
    unread_count: stats?.unread_count ?? 0,
    sources: {
      submissions: source === "submissions",
      markup: source === "markup",
    },
    rule: null,
  });
}

function collectStringValues(value: unknown, output: string[]): void {
  if (typeof value === "string") {
    output.push(value);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectStringValues(item, output);
    return;
  }

  if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectStringValues(item, output);
  }
}

function extractMarkupFormNames(value: unknown): string[] {
  const strings: string[] = [];
  collectStringValues(value, strings);

  const names = new Set<string>();
  for (const text of strings) {
    if (!text.includes("data-form-name")) continue;

    DATA_FORM_NAME_REGEX.lastIndex = 0;
    let match = DATA_FORM_NAME_REGEX.exec(text);
    while (match) {
      const formName = normalizeFormDisplayName(
        match[1] ?? match[2] ?? match[3] ?? "",
      );
      if (formName && formName !== NEWSLETTER_FORM_NAME) {
        names.add(formName);
      }
      match = DATA_FORM_NAME_REGEX.exec(text);
    }
  }

  return Array.from(names);
}

function serializeRule(rule: IFormRecipientRule | undefined) {
  if (!rule) return null;

  return {
    id: rule.id,
    recipients: Array.isArray(rule.recipients) ? rule.recipients : [],
    is_enabled: rule.is_enabled,
    updated_at: rule.updated_at,
  };
}

function addRuleOnlyCatalogItem(
  forms: Map<string, FormCatalogItem>,
  rule: IFormRecipientRule,
): void {
  if (forms.has(rule.form_key)) return;

  forms.set(rule.form_key, {
    form_name: rule.form_name,
    form_key: rule.form_key,
    display_label: null,
    sort_order: null,
    submission_count: 0,
    last_seen: null,
    unread_count: 0,
    sources: {
      submissions: false,
      markup: false,
    },
    rule: null,
  });
}

function applyCatalogPreferences(
  forms: Map<string, FormCatalogItem>,
  preferences: IFormCatalogPreference[],
): void {
  const preferencesByKey = new Map(
    preferences.map((preference) => [preference.form_key, preference]),
  );

  for (const [formKey, item] of forms.entries()) {
    const preference = preferencesByKey.get(formKey);
    if (!preference) continue;

    item.display_label = preference.display_label;
    item.sort_order = preference.sort_order;
  }
}

function compareCatalogItems(a: FormCatalogItem, b: FormCatalogItem): number {
  const aOrder = a.sort_order ?? Number.MAX_SAFE_INTEGER;
  const bOrder = b.sort_order ?? Number.MAX_SAFE_INTEGER;
  if (aOrder !== bOrder) return aOrder - bOrder;

  if (b.submission_count !== a.submission_count) {
    return b.submission_count - a.submission_count;
  }
  const aLastSeen = a.last_seen ? new Date(a.last_seen).getTime() : 0;
  const bLastSeen = b.last_seen ? new Date(b.last_seen).getTime() : 0;
  if (bLastSeen !== aLastSeen) return bLastSeen - aLastSeen;
  return a.form_name.localeCompare(b.form_name);
}

export async function listFormCatalog(projectId: string): Promise<FormCatalogItem[]> {
  const project = await ProjectModel.findById(projectId);
  const [submissionStats, pages, templatePages, rules, preferences] = await Promise.all([
    FormSubmissionModel.listDetectedFormStats(projectId, [NEWSLETTER_FORM_NAME]),
    PageModel.findSectionsByProjectId(projectId),
    project?.template_id
      ? TemplatePageModel.findSectionsByTemplateId(project.template_id)
      : Promise.resolve([]),
    FormRecipientRuleModel.listByProject(projectId),
    FormCatalogPreferenceModel.listByProject(projectId),
  ]);

  const forms = new Map<string, FormCatalogItem>();
  for (const form of submissionStats) {
    addCatalogItem(forms, form.form_name, "submissions", {
      submission_count: form.submission_count,
      last_seen: form.last_seen,
      unread_count: form.unread_count,
    });
  }

  for (const page of [...pages, ...templatePages]) {
    for (const formName of extractMarkupFormNames(page.sections)) {
      addCatalogItem(forms, formName, "markup");
    }
  }

  const rulesByKey = new Map(rules.map((rule) => [rule.form_key, rule]));
  for (const rule of rules) addRuleOnlyCatalogItem(forms, rule);

  for (const [formKey, item] of forms.entries()) {
    item.rule = serializeRule(rulesByKey.get(formKey));
  }

  applyCatalogPreferences(forms, preferences);

  return Array.from(forms.values()).sort(compareCatalogItems);
}

/**
 * Derive the union of field keys observed across the most recent submissions
 * for a given form. Handles both legacy flat and sectioned `FormContents`
 * shapes via flattenSubmissionContents.
 *
 * Returns each key with its occurrence count and a sample (most recent
 * non-null) value, so the UI can display the user a preview of what the
 * field actually contains before they map it.
 */
export async function getFormFieldShape(
  projectId: string,
  formName: string,
  sampleSize = 20,
): Promise<FieldShapeEntry[]> {
  const rows = await FormSubmissionModel.listRecentContentsByProjectAndForm(
    projectId,
    formName,
    sampleSize,
  );

  const counts = new Map<string, number>();
  const samples = new Map<string, string>();

  for (const row of rows) {
    const flat = flattenSubmissionContents(row.contents);
    for (const [key, value] of Object.entries(flat)) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
      if (!samples.has(key)) {
        if (typeof value === "string" && value.length > 0) {
          samples.set(key, value.length > 200 ? value.slice(0, 200) + "…" : value);
        } else if (value && typeof value === "object" && "name" in value && typeof value.name === "string") {
          samples.set(key, `[file: ${value.name}]`);
        }
      }
    }
  }

  return Array.from(counts.entries())
    .map(([key, occurrence_count]) => ({
      key,
      occurrence_count,
      sample_value: samples.get(key) ?? null,
    }))
    .sort((a, b) => b.occurrence_count - a.occurrence_count);
}
