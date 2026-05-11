import { Settings, TableProperties } from "lucide-react";

export type FormSubmissionsView = "submissions" | "settings";

export type FormSubmissionsViewTabsProps = {
  activeView: FormSubmissionsView;
  onChange: (view: FormSubmissionsView) => void;
};

const tabs: Array<{
  key: FormSubmissionsView;
  label: string;
  icon: typeof TableProperties;
}> = [
  { key: "submissions", label: "Submissions", icon: TableProperties },
  { key: "settings", label: "Settings", icon: Settings },
];

export function FormSubmissionsViewTabs({
  activeView,
  onChange,
}: FormSubmissionsViewTabsProps) {
  return (
    <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeView === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
              isActive
                ? "bg-white text-alloro-orange shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Icon className="h-4 w-4" />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
