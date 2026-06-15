import { Download, FileText, Image } from "lucide-react";
import type { FileValue } from "../../../../api/websites";

export default function FileValueDisplay({ file }: { file: FileValue }) {
  const isImage = file.type.startsWith("image/");

  if (isImage && file.url) {
    return (
      <div className="flex flex-col gap-2">
        <img
          src={file.url}
          alt={file.name}
          className="max-w-48 max-h-32 rounded-lg border border-gray-200 object-contain"
        />
        <a
          href={file.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-alloro-orange hover:text-orange-700 font-medium transition"
        >
          <Download size={14} />
          {file.name}
        </a>
      </div>
    );
  }

  return (
    <a
      href={file.url || "#"}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1.5 text-sm font-medium transition ${
        file.url
          ? "text-alloro-orange hover:text-orange-700"
          : "text-gray-400 cursor-not-allowed"
      }`}
    >
      {file.type === "application/pdf" ? <FileText size={14} /> : <Image size={14} />}
      {file.name}
      {file.url && <Download size={12} />}
    </a>
  );
}
