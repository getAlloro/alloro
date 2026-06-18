import type { FileValue } from "../../../../api/websites";
import { isFileValue } from "../formSubmissionsTab.utils";
import FileValueDisplay from "./FileValueDisplay";

/** Render legacy flat key-value contents */
export default function FlatView({ contents }: { contents: Record<string, string | FileValue> }) {
  return (
    <div className="space-y-2">
      {Object.entries(contents).map(([key, value]) => (
        <div key={key} className="flex gap-3">
          <span className="text-sm text-gray-400 w-40 flex-shrink-0">{key}</span>
          {isFileValue(value) ? (
            <FileValueDisplay file={value} />
          ) : (
            <span className="text-sm text-gray-900 font-medium">{value}</span>
          )}
        </div>
      ))}
    </div>
  );
}
