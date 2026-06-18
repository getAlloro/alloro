import type { NavigateFunction } from "react-router-dom";
import { AdminTopBar } from "../../../components/Admin/shell/AdminTopBar";

export function EditorErrorState({
  error,
  projectId,
  navigate,
}: {
  error: string | null;
  projectId: string | undefined;
  navigate: NavigateFunction;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <AdminTopBar />
      <div className="flex items-center justify-center" style={{ height: "calc(100vh - 4rem)" }}>
        <div className="text-center">
          <p className="text-sm text-red-500 mb-4">{error || "Page not found"}</p>
          <button
            onClick={() => navigate(`/admin/websites/${projectId}`)}
            className="text-xs text-alloro-orange hover:text-alloro-orange/80 transition-colors"
          >
            Back to project
          </button>
        </div>
      </div>
    </div>
  );
}
