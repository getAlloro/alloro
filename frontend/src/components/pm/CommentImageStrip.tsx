import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Image } from "lucide-react";
import { getAttachmentDownloadUrl } from "../../api/pm";
import type { PmTaskAttachment } from "../../types/pm";
import { logger } from "../../lib/logger";

export type CommentImageStripProps = {
  taskId: string;
  attachments: PmTaskAttachment[];
};

export function CommentImageStrip({
  taskId,
  attachments,
}: CommentImageStripProps) {
  const images = useMemo(
    () => attachments.filter((item) => item.mime_type.startsWith("image/")),
    [attachments],
  );
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    let isCancelled = false;
    Promise.all(
      images.map(async (image) => {
        const signed = await getAttachmentDownloadUrl(taskId, image.id);
        return [image.id, signed.url] as const;
      }),
    )
      .then((entries) => {
        if (!isCancelled) setUrls(Object.fromEntries(entries));
      })
      .catch((error: unknown) => {
        logger.error("[CommentImageStrip] failed to load image URLs", error);
      });
    return () => {
      isCancelled = true;
    };
  }, [attachments, images, taskId]);

  if (images.length === 0) return null;

  return (
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {images.map((image) => (
        <a
          key={image.id}
          href={urls[image.id] || undefined}
          target="_blank"
          rel="noopener noreferrer"
          className="group relative block overflow-hidden rounded-md border border-pm-border bg-pm-bg-hover"
        >
          <div className="flex aspect-[4/3] items-center justify-center">
            {urls[image.id] ? (
              <img
                src={urls[image.id]}
                alt={image.filename}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            ) : (
              <Image className="h-5 w-5 text-pm-text-muted" />
            )}
          </div>
          <span className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-black/55 px-2 py-1 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
            <span className="min-w-0 flex-1 truncate">{image.filename}</span>
            <ExternalLink className="h-3 w-3 flex-none" />
          </span>
        </a>
      ))}
    </div>
  );
}
