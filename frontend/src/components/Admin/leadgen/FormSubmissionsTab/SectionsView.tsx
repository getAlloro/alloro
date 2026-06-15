import type { FormSection } from "../../../../api/websites";
import { isFileValue } from "../formSubmissionsTab.utils";
import FileValueDisplay from "./FileValueDisplay";

/** Render sections-format contents with grouped headers */
export default function SectionsView({ sections }: { sections: FormSection[] }) {
  return (
    <div className="space-y-5">
      {sections.map((section, si) => (
        <div key={si}>
          <h5 className="text-sm font-semibold text-gray-700 border-b border-gray-100 pb-1.5 mb-2">
            {section.title}
          </h5>
          <div className="space-y-1.5">
            {section.fields.map(([key, value], fi) => (
              <div key={fi} className="flex gap-3">
                <span className="text-sm text-gray-400 w-44 flex-shrink-0">{key}</span>
                {isFileValue(value) ? (
                  <FileValueDisplay file={value} />
                ) : (
                  <span className="text-sm text-gray-900 font-medium">{value}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
