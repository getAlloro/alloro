import { AlertCircle } from "lucide-react";

export function ReadOnlyState() {
  return (
    <div className="flex items-center justify-center h-screen">
      <div className="text-center max-w-md">
        <AlertCircle className="w-16 h-16 text-amber-500 mx-auto mb-4" />
        <h2 className="font-display text-xl font-medium text-alloro-navy mb-2">
          Website in Read-Only Mode
        </h2>
        <p className="text-gray-600 mb-4">
          Your subscription has been downgraded. Your website is still live
          but you cannot make edits.
        </p>
        <p className="text-sm text-gray-500">
          Contact your administrator to upgrade your plan and regain editing
          access.
        </p>
      </div>
    </div>
  );
}
