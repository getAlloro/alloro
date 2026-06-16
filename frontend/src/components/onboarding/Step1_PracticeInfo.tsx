import { useState, useRef, useEffect } from "react";
import { ChevronLeft, Loader2, CheckCircle, AlertTriangle, XCircle } from "lucide-react";
import onboarding from "../../api/onboarding";

type DomainStatus = "idle" | "checking" | "valid" | "warning" | "unreachable";

interface Step1PracticeInfoProps {
  practiceName: string;
  domainName: string;
  onPracticeNameChange: (value: string) => void;
  onDomainNameChange: (value: string) => void;
  onNext: () => void;
  onBack: () => void;
  isSaving?: boolean;
}

export const Step1PracticeInfo: React.FC<Step1PracticeInfoProps> = ({
  practiceName,
  domainName,
  onPracticeNameChange,
  onDomainNameChange,
  onNext,
  onBack,
  isSaving,
}) => {
  const [errors, setErrors] = useState<{
    practiceName?: string;
    domain?: string;
  }>({});

  // Domain check state
  const [domainStatus, setDomainStatus] = useState<DomainStatus>("idle");
  const [domainMessage, setDomainMessage] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Domain sanitization and validation
  const sanitizeDomain = (input: string): string => {
    let cleaned = input.trim().toLowerCase();
    cleaned = cleaned.replace(/^https?:\/\//, "");
    cleaned = cleaned.replace(/^www\./, "");
    cleaned = cleaned.replace(/\/+$/, "");
    return cleaned;
  };

  const domainRegex = /^[a-z0-9]+([-.]{1}[a-z0-9]+)*\.[a-z]{2,}$/;

  // Debounced domain check
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    const sanitized = sanitizeDomain(domainName);

    if (!sanitized || !domainRegex.test(sanitized)) {
      setDomainStatus("idle");
      setDomainMessage("");
      return;
    }

    setDomainStatus("checking");
    setDomainMessage("");

    debounceRef.current = setTimeout(async () => {
      try {
        const response = await onboarding.checkDomain(sanitized);
        setDomainStatus(response.status as DomainStatus);
        setDomainMessage(response.message ?? "");
      } catch {
        setDomainStatus("idle");
        setDomainMessage("");
      }
    }, 800);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [domainName]);

  const handleDomainChange = (value: string) => {
    const sanitized = sanitizeDomain(value);
    onDomainNameChange(sanitized);
    if (errors.domain) setErrors({ ...errors, domain: undefined });
  };

  const renderDomainStatus = () => {
    switch (domainStatus) {
      case "checking":
        return (
          <div className="flex items-center gap-2 mt-2">
            <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
            <span className="text-sm text-slate-500">Checking domain...</span>
          </div>
        );
      case "valid":
        return (
          <div className="flex items-center gap-2 mt-2">
            <CheckCircle className="w-4 h-4 text-green-500" />
            <span className="text-sm text-green-600">{domainMessage}</span>
          </div>
        );
      case "warning":
        return (
          <div className="flex items-center gap-2 mt-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <span className="text-sm text-amber-600">{domainMessage}</span>
          </div>
        );
      case "unreachable":
        return (
          <div className="flex items-center gap-2 mt-2">
            <XCircle className="w-4 h-4 text-red-400" />
            <span className="text-sm text-red-500">{domainMessage}</span>
          </div>
        );
      default:
        return null;
    }
  };

  const validate = () => {
    const newErrors: typeof errors = {};

    if (!practiceName.trim()) {
      newErrors.practiceName = "Practice name is required";
    }

    const sanitized = sanitizeDomain(domainName);
    if (!sanitized) {
      newErrors.domain = "Domain name is required";
    } else if (!domainRegex.test(sanitized)) {
      newErrors.domain = "Please enter a valid domain name (e.g., example.com)";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validate()) {
      onNext();
    }
  };

  const isFormValid = () => {
    const sanitized = sanitizeDomain(domainName);
    return (
      practiceName.trim() &&
      sanitized &&
      domainRegex.test(sanitized)
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold font-heading text-alloro-navy mb-2 tracking-tight">
          Your Practice
        </h2>
        <p className="text-slate-500 text-sm">
          Tell us about your practice
        </p>
      </div>

      {/* Form */}
      <div className="space-y-6">
        {/* Practice Name */}
        <div>
          <label
            htmlFor="practiceName"
            className="block text-sm font-medium text-alloro-navy mb-2"
          >
            Practice Name
          </label>
          <input
            id="practiceName"
            type="text"
            value={practiceName}
            onChange={(e) => {
              onPracticeNameChange(e.target.value);
              if (errors.practiceName) setErrors({ ...errors, practiceName: undefined });
            }}
            placeholder="e.g., Best Dental Practice"
            className={`w-full px-4 py-3 rounded-xl bg-white border ${
              errors.practiceName ? "border-red-400" : "border-slate-300"
            } text-alloro-navy placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-alloro-orange/20 focus:border-alloro-orange transition-all`}
          />
          {errors.practiceName && <p className="mt-1 text-sm text-red-600">{errors.practiceName}</p>}
        </div>

        {/* Domain Name */}
        <div>
          <label
            htmlFor="domainName"
            className="block text-sm font-medium text-alloro-navy mb-2"
          >
            Website Domain
          </label>
          <input
            id="domainName"
            type="text"
            value={domainName}
            onChange={(e) => handleDomainChange(e.target.value)}
            placeholder="bestdentalpractice.com"
            className={`w-full px-4 py-3 rounded-xl bg-white border ${
              errors.domain ? "border-red-400" : "border-slate-300"
            } text-alloro-navy placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-alloro-orange/20 focus:border-alloro-orange transition-all`}
          />
          {errors.domain && <p className="mt-1 text-sm text-red-600">{errors.domain}</p>}
          {!errors.domain && renderDomainStatus()}
          {!errors.domain && domainStatus === "idle" && domainName && (
            <p className="text-xs text-slate-400 mt-1">
              Enter without "https://" or "www"
            </p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-4">
        <button
          onClick={onBack}
          disabled={isSaving}
          className="px-5 py-3 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-alloro-orange/30 transition-all font-medium flex items-center gap-2"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>
        <button
          onClick={handleNext}
          disabled={!isFormValid() || isSaving}
          className={`
            flex-1 px-6 py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2
            ${
              isFormValid() && !isSaving
                ? "bg-gradient-to-r from-alloro-orange to-[#c45a47] text-white hover:shadow-lg hover:shadow-alloro-orange/30 hover:-translate-y-0.5"
                : "bg-slate-100 text-slate-400 cursor-not-allowed"
            }
          `}
        >
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Saving...
            </>
          ) : (
            "Continue"
          )}
        </button>
      </div>
    </div>
  );
};
