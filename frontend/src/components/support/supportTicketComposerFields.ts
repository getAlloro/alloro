import type { SupportTicketType } from "../../api/support";

export const initialSupportAnswers = {
  bug_report: { tryingToDo: "", whatHappened: "", workImpact: "" },
  feature_request: { idea: "", usefulness: "", importance: "" },
  website_edit: { pageUrl: "", requestedChange: "" },
};

export type SupportComposerFieldConfig = {
  name: string;
  label: string;
  required: boolean;
  kind: "input" | "textarea" | "select";
  rows?: number;
  placeholder: string;
  options?: Array<{ value: string; label: string }>;
};

export function formatFieldLabel(field: SupportComposerFieldConfig): string {
  return field.required ? field.label : `${field.label} (optional)`;
}

export function getSupportFieldConfig(
  type: SupportTicketType,
): SupportComposerFieldConfig[] {
  if (type === "feature_request") {
    return [
      {
        name: "idea",
        label: "What would you like Alloro to do?",
        required: true,
        kind: "input",
        placeholder: "Describe the workflow or capability you want.",
      },
      {
        name: "usefulness",
        label: "How would this help your practice use Alloro?",
        required: true,
        kind: "textarea",
        rows: 3,
        placeholder: "Tell us what this would make easier, faster, or clearer.",
      },
      {
        name: "importance",
        label: "How important is this right now?",
        required: false,
        kind: "select",
        placeholder: "Choose importance",
        options: [
          { value: "blocking", label: "Blocking something important for us" },
          { value: "big_difference", label: "Would make a big difference" },
          { value: "nice_to_have", label: "Nice to have" },
        ],
      },
    ];
  }

  if (type === "website_edit") {
    return [
      {
        name: "pageUrl",
        label: "Where on the site is this change?",
        required: true,
        kind: "input",
        placeholder: "https://yourpractice.com/page",
      },
      {
        name: "requestedChange",
        label: "What should it say or look like?",
        required: true,
        kind: "textarea",
        rows: 4,
        placeholder: "Describe the exact edit, copy, image, or layout change.",
      },
    ];
  }

  return [
    {
      name: "tryingToDo",
      label: "What were you trying to do?",
      required: true,
      kind: "input",
      placeholder: "Tell us the task or workflow you were in.",
    },
    {
      name: "whatHappened",
      label: "What happened instead?",
      required: true,
      kind: "textarea",
      rows: 4,
      placeholder: "Tell us where you clicked, what you saw, and what stopped you.",
    },
    {
      name: "workImpact",
      label: "How is this affecting your work?",
      required: true,
      kind: "select",
      placeholder: "Choose impact",
      options: [
        { value: "blocked", label: "I can't move forward at all" },
        {
          value: "painful_workaround",
          label: "I found a workaround but it's painful",
        },
        { value: "annoying", label: "It's annoying but I can still work" },
        { value: "minor", label: "It's cosmetic or minor" },
      ],
    },
  ];
}
