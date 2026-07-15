import React from "react";
import { motion } from "framer-motion";
import { Sparkles, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useLabels } from "../../hooks/useLabels";
import { usePmsCopy } from "../PMS/pmsCopy";

interface PMSUploadBannerProps {
  onNavigate?: () => void;
}

export const PMSUploadBanner: React.FC<PMSUploadBannerProps> = ({
  onNavigate,
}) => {
  const navigate = useNavigate();
  const labels = useLabels();
  const copy = usePmsCopy();

  const handleGoToReferralsHub = () => {
    // Store flag to trigger scroll + highlight on Referrals Hub page
    sessionStorage.setItem("scrollToUpload", "true");

    if (onNavigate) {
      onNavigate();
    }

    navigate("/pmsStatistics");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200 rounded-2xl p-6 mb-8"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="p-2 bg-green-100 rounded-xl shrink-0">
            <Sparkles size={20} className="text-green-600" />
          </div>
          <div>
            <h3 className="font-black text-green-900 text-lg">
              You're All Set!
            </h3>
            <p className="text-green-700 text-sm mt-1">
              Upload your first {copy.dataNameLower} to start receiving
              personalized insights and recommendations for your{" "}
              {labels.orgNoun}.
            </p>
          </div>
        </div>
        <button
          onClick={handleGoToReferralsHub}
          className="flex items-center justify-center gap-2 px-5 py-3 text-sm font-bold text-white bg-green-600 hover:bg-green-700 rounded-xl transition-all shadow-lg shadow-green-600/20 whitespace-nowrap shrink-0"
        >
          Go to {labels.hubReferrals}
          <ArrowRight size={16} />
        </button>
      </div>
    </motion.div>
  );
};
