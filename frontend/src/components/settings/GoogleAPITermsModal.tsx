import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Shield, CheckCircle2, AlertCircle } from "lucide-react";

interface GoogleAPITermsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccept?: () => void;
}

export const GoogleAPITermsModal: React.FC<GoogleAPITermsModalProps> = ({
  isOpen,
  onClose,
  onAccept,
}) => {
  const handleAccept = () => {
    if (onAccept) {
      onAccept();
    }
    onClose();
  };
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col">
              {/* Header */}
              <div className="bg-gradient-to-r from-alloro-navy to-alloro-navy/90 text-white p-8 relative shrink-0">
                <button
                  onClick={onClose}
                  className="absolute top-6 right-6 p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors"
                >
                  <X size={20} />
                </button>
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center">
                    <Shield size={28} className="text-alloro-orange" />
                  </div>
                  <div>
                    <h2 className="font-display text-2xl font-medium tracking-tight">
                      Google API Access Terms
                    </h2>
                    <p className="text-white/70 text-sm mt-1">
                      How Alloro uses your Google data
                    </p>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="p-8 overflow-y-auto flex-1 min-h-0 space-y-8">
                {/* Important Notice */}
                <div className="bg-green-50 border border-green-200 rounded-2xl p-5 flex gap-4">
                  <CheckCircle2 className="w-6 h-6 text-green-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-green-900 mb-1">
                      Read-Only Access
                    </p>
                    <p className="text-green-700 text-sm">
                      Alloro uses <strong>read-only access</strong> for all
                      analytics and search data. We do not delete, modify, or
                      perform any alterations to your data without your explicit
                      consent.
                    </p>
                  </div>
                </div>

                {/* GBP Section */}
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-white border border-slate-100 flex items-center justify-center p-2 shadow-sm">
                      <img
                        src="/google-business-profile.png"
                        alt="Google Business Profile"
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <div>
                      <h3 className="font-black text-alloro-navy text-lg">
                        Google Business Profile (GBP)
                      </h3>
                      <p className="text-slate-500 text-sm">
                        business.manage scope
                      </p>
                    </div>
                  </div>
                  <div className="pl-15 ml-6 border-l-2 border-slate-100 pl-6 space-y-3">
                    <div className="flex items-start gap-3">
                      <img
                        src="/logo.png"
                        alt="Alloro"
                        className="w-4 h-4 mt-1 shrink-0 rounded"
                      />
                      <p className="text-slate-600 text-sm">
                        <strong>What we access:</strong> Business listing
                        information, reviews, ratings, profile insights, and
                        performance metrics.
                      </p>
                    </div>
                    <div className="flex items-start gap-3">
                      <CheckCircle2
                        size={16}
                        className="text-green-500 mt-1 shrink-0"
                      />
                      <p className="text-slate-600 text-sm">
                        <strong>How we use it:</strong> Track your online
                        reputation, monitor reviews, analyze customer feedback,
                        and measure local search performance.
                      </p>
                    </div>
                    <div className="bg-alloro-orange rounded-xl p-4 -ml-4">
                      <p className="text-white text-sm font-semibold mb-1">
                        Note:
                      </p>
                      <p className="text-white/90 text-sm">
                        Google's API doesn't offer a read-only option for Google
                        Business Profiles, so we have to use the manage
                        permission. We do not make any changes to your business
                        profile without your consent and use this API solely for
                        data gathering and analysis.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Data Protection Notice */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-3">
                  <div className="flex items-center gap-3">
                    <AlertCircle size={20} className="text-slate-600" />
                    <h4 className="font-bold text-alloro-navy">
                      Your Data, Your Control
                    </h4>
                  </div>
                  <ul className="space-y-2 text-sm text-slate-600 ml-8">
                    <li className="flex items-start gap-2">
                      <span className="text-green-500 mt-0.5">✓</span>
                      We never store your raw Google data permanently
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-green-500 mt-0.5">✓</span>
                      You can revoke access at any time from Google Account
                      settings
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-green-500 mt-0.5">✓</span>
                      All data transmission is encrypted (TLS 1.3)
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-green-500 mt-0.5">✓</span>
                      HIPAA compliant data handling practices
                    </li>
                  </ul>
                </div>
              </div>

              {/* Footer */}
              <div className="p-6 border-t border-slate-100 bg-slate-50/50 shrink-0">
                <button
                  onClick={handleAccept}
                  className="w-full py-4 bg-alloro-navy text-white font-bold rounded-xl hover:bg-alloro-navy/90 transition-colors"
                >
                  I Understand
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
