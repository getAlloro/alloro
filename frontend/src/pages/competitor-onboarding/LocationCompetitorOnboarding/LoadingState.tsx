import { Loader2 } from "lucide-react";

export function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center py-32">
      <Loader2 className="w-10 h-10 text-alloro-orange animate-spin" />
      <p className="mt-4 text-sm text-alloro-textDark/60 font-medium">
        Loading your competitor list…
      </p>
    </div>
  );
}
