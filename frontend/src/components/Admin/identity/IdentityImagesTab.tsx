import { useMemo } from "react";
import { ImageIcon } from "lucide-react";
import type { ProjectIdentity } from "../../api/websites";

type IdentityImage = NonNullable<
  ProjectIdentity["extracted_assets"]
>["images"][number];

interface IdentityImagesTabProps {
  images: IdentityImage[];
}

/**
 * Read-only grid of every image captured during warmup and labeled by
 * Claude-vision. No API calls — pure render from props.
 *
 * Structure + tile styling mirrors MediaBrowser.tsx (PageEditor) — the
 * closest analog for a labeled image grid.
 */
export default function IdentityImagesTab({ images }: IdentityImagesTabProps) {
  const useCaseCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const img of images) {
      const key = (img.use_case || "").trim();
      if (!key) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [images]);

  if (!images || images.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 p-8 text-center">
        <ImageIcon className="mx-auto h-8 w-8 text-gray-300" />
        <p className="mt-3 text-sm text-gray-500">
          No images captured during warmup. Re-run warmup with the Google
          Business Profile + website URL to collect photos.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header row: count + dominant use-cases */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-sm text-gray-700">
            <span className="font-semibold">{images.length}</span> image
            {images.length === 1 ? "" : "s"} analyzed
          </p>
          <p className="text-[11px] text-gray-400 mt-1">
            Click a tile to open the full-size image in a new tab.
          </p>
        </div>
        {useCaseCounts.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            {useCaseCounts.slice(0, 6).map(([useCase, count]) => (
              <span
                key={useCase}
                className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-semibold text-gray-700"
              >
                {useCase}
                <span className="text-gray-400">· {count}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Grid — 2 cols mobile, 3 cols desktop */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {images.map((img, idx) => (
          <ImageTile
            key={`${img.s3_url || img.source_url || "img"}-${idx}`}
            image={img}
          />
        ))}
      </div>
    </div>
  );
}

function ImageTile({ image }: { image: IdentityImage }) {
  const href = image.s3_url || image.source_url || undefined;
  const rank =
    typeof image.usability_rank === "number"
      ? Math.max(0, Math.min(5, Math.round(image.usability_rank)))
      : null;

  const Tile = (
    <div className="group relative aspect-square overflow-hidden rounded-lg border border-gray-200 bg-gray-100">
      {image.s3_url ? (
        <img
          src={image.s3_url}
          alt={image.description || "Identity image"}
          loading="lazy"
          className="h-full w-full object-cover transition group-hover:scale-[1.02]"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <ImageIcon className="h-6 w-6 text-gray-400" />
        </div>
      )}

      {/* Corner badges */}
      <div className="pointer-events-none absolute inset-x-1.5 top-1.5 flex items-start justify-between gap-1.5">
        <div className="flex flex-wrap gap-1">
          {image.is_logo && (
            <span className="inline-flex items-center rounded border border-white/20 bg-black/70 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white backdrop-blur-sm">
              Logo
            </span>
          )}
          {image.use_case && (
            <span className="inline-flex items-center rounded border border-white/20 bg-black/60 px-1.5 py-0.5 text-[9px] font-semibold text-white backdrop-blur-sm">
              {image.use_case}
            </span>
          )}
        </div>
        {rank !== null && <UsabilityDots rank={rank} />}
      </div>

      {/* Hover overlay: description + use_case + resolution */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-1 bg-gradient-to-t from-black/85 via-black/55 to-transparent p-2 opacity-0 transition group-hover:translate-y-0 group-hover:opacity-100">
        {image.description && (
          <div className="line-clamp-3 text-[11px] leading-snug text-white">
            {image.description}
          </div>
        )}
        <div className="mt-1 flex items-center gap-2 text-[10px] text-white/70">
          {image.use_case && <span className="truncate">{image.use_case}</span>}
          {image.resolution && (
            <span className="font-mono truncate">{image.resolution}</span>
          )}
        </div>
      </div>
    </div>
  );

  if (!href) return Tile;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-alloro-orange focus-visible:rounded-lg"
      title={image.description || "Open image in new tab"}
    >
      {Tile}
    </a>
  );
}

function UsabilityDots({ rank }: { rank: number }) {
  return (
    <div
      title={`Usability rank: ${rank}/5`}
      className="inline-flex items-center gap-0.5 rounded-full border border-white/20 bg-black/60 px-1.5 py-1 backdrop-blur-sm"
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={`block h-1.5 w-1.5 rounded-full ${
            i <= rank ? "bg-white" : "bg-white/25"
          }`}
        />
      ))}
    </div>
  );
}
