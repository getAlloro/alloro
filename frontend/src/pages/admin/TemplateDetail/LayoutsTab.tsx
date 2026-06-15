import Editor from "@monaco-editor/react";

export function LayoutsTab({
  activeLayoutField,
  setActiveLayoutField,
  wrapperContent,
  headerContent,
  footerContent,
  handleLayoutFieldChange,
}: {
  activeLayoutField: "wrapper" | "header" | "footer";
  setActiveLayoutField: (field: "wrapper" | "header" | "footer") => void;
  wrapperContent: string;
  headerContent: string;
  footerContent: string;
  handleLayoutFieldChange: (
    field: "wrapper" | "header" | "footer",
    value: string | undefined
  ) => void;
}) {
  return (
    <div className="space-y-4">
      {/* Layout field selector */}
      <div className="flex items-center rounded-lg border border-gray-200 bg-white p-0.5 w-fit">
        {(["wrapper", "header", "footer"] as const).map((field) => (
          <button
            key={field}
            onClick={() => setActiveLayoutField(field)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition capitalize ${
              activeLayoutField === field
                ? "bg-gray-100 text-gray-900"
                : "text-gray-400 hover:text-gray-600"
            }`}
          >
            {field}
          </button>
        ))}
      </div>

      {/* Monaco editor for the active layout field */}
      <div
        className="rounded-xl border border-gray-200 bg-white overflow-hidden flex flex-col"
        style={{ height: "calc(100vh - 360px)", minHeight: 500 }}
      >
        <div className="px-4 py-2 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            {activeLayoutField} — HTML Editor
          </span>
          <span className="text-xs text-gray-400">
            {activeLayoutField === "wrapper" && "Use {{slot}} as the placeholder for page content"}
            {activeLayoutField === "header" && "Shared header rendered above page sections"}
            {activeLayoutField === "footer" && "Shared footer rendered below page sections"}
          </span>
        </div>
        <div className="flex-1">
          <Editor
            height="100%"
            defaultLanguage="html"
            value={
              activeLayoutField === "wrapper"
                ? wrapperContent
                : activeLayoutField === "header"
                ? headerContent
                : footerContent
            }
            onChange={(v) => handleLayoutFieldChange(activeLayoutField, v)}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              lineNumbers: "on",
              wordWrap: "on",
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
              padding: { top: 12 },
            }}
          />
        </div>
      </div>
    </div>
  );
}
