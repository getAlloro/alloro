import Lottie from "lottie-react";
import cogitatingSpinner from "../../../assets/cogitating-spinner.json";
import { CogitatingText } from "./CogitatingText";

export function PMSVisualPillarsLoadingState() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-alloro-bg">
      <div className="text-center">
        <div className="relative flex items-center justify-center h-16 w-16 mx-auto mb-2">
          <div
            className="absolute inset-0 animate-spin rounded-full border-[3px] border-alloro-orange/15 border-t-alloro-orange"
            style={{ animationDuration: "1.2s" }}
          />
          <Lottie animationData={cogitatingSpinner} loop className="relative z-10 w-9 h-9" />
        </div>
        <CogitatingText />
      </div>
    </div>
  );
}
