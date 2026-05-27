import { useEffect, useRef, useState } from "react";
import { Image, Loader2, UploadCloud, X } from "lucide-react";
import { toast } from "react-hot-toast";

export type GbpPostImageUploaderProps = {
  value: string;
  label?: string;
  disabled?: boolean;
  showPreview?: boolean;
  uploadDisabledReason?: string | null;
  uploadSuccessMessage?: string;
  onChange: (url: string) => void;
  onUpload: (file: File) => Promise<string>;
};

export function GbpPostImageUploader({
  value,
  label = "Post image",
  disabled = false,
  showPreview = true,
  uploadDisabledReason = null,
  uploadSuccessMessage = "Image uploaded.",
  onChange,
  onUpload,
}: GbpPostImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isDisabled = disabled || isUploading || Boolean(uploadDisabledReason);

  useEffect(() => {
    setImageFailed(false);
  }, [value]);

  const handleSelect = async (file?: File) => {
    if (!file) return;
    if (!["image/jpeg", "image/jpg", "image/png"].includes(file.type)) {
      setError("Choose a JPG or PNG image for Google Business Profile.");
      return;
    }

    setIsUploading(true);
    setError(null);
    try {
      const imageUrl = await onUpload(file);
      onChange(imageUrl);
      toast.success(uploadSuccessMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Image upload failed.");
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
          {label}
        </span>
        {value && !disabled && (
          <button
            type="button"
            disabled={isUploading}
            onClick={() => onChange("")}
            className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-slate-400 transition-colors hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X size={12} />
            Clear
          </button>
        )}
      </div>

      {showPreview && value && !imageFailed ? (
        <img
          src={value}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
          className="h-32 w-full rounded-[10px] border border-slate-200 object-cover"
        />
      ) : showPreview ? (
        <div className="flex h-32 w-full items-center justify-center rounded-[10px] border border-dashed border-slate-300 bg-white text-slate-400">
          <Image size={20} />
        </div>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png"
        className="sr-only"
        disabled={isDisabled}
        onChange={(event) => void handleSelect(event.target.files?.[0])}
      />

      <button
        type="button"
        disabled={isDisabled}
        onClick={() => inputRef.current?.click()}
        className="inline-flex w-full items-center justify-center gap-2 rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-xs font-black uppercase tracking-widest text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isUploading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <UploadCloud className="h-4 w-4" />
        )}
        {isUploading ? "Uploading" : value ? "Replace image" : "Upload image"}
      </button>

      {uploadDisabledReason && (
        <p className="text-xs font-bold leading-5 text-amber-700">
          {uploadDisabledReason}
        </p>
      )}
      {error && <p className="text-xs font-bold leading-5 text-red-600">{error}</p>}
      {value && (
        <p className="truncate text-[10px] font-bold text-slate-400">
          {value}
        </p>
      )}
    </div>
  );
}
