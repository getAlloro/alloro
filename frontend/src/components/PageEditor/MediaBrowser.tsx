import { useState, useEffect } from "react";
import { X, Loader2, Image } from "lucide-react";
import type { MediaApi, MediaItem } from "../../api/websiteMedia";

export type { MediaApi, MediaItem } from "../../api/websiteMedia";

interface MediaBrowserProps {
  mediaApi: MediaApi;
  onSelect: (media: MediaItem) => void;
  onClose: () => void;
  compact?: boolean;
}

export default function MediaBrowser({ mediaApi, onSelect, onClose, compact }: MediaBrowserProps) {
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMedia = async () => {
      try {
        setLoading(true);
        const data = await mediaApi.list({ type: "all", limit: 50 });
        if (data.success) {
          setMediaItems(data.data || []);
        }
      } catch (err) {
        console.error("Failed to fetch media:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchMedia();
  }, [mediaApi]);

  return (
    <div className={`border border-gray-200 rounded-lg bg-white shadow-lg overflow-y-auto ${compact ? "max-h-[180px]" : "max-h-[300px]"}`}>
      <div className="sticky top-0 bg-white border-b border-gray-200 px-3 py-2 flex items-center justify-between">
        <span className="text-xs font-medium text-gray-700">Media Library</span>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
        </div>
      ) : mediaItems.length === 0 ? (
        <div className="text-center py-8 text-xs text-gray-500">
          No media uploaded yet
        </div>
      ) : (
        <div className={`grid p-2 ${compact ? "grid-cols-4 gap-1.5" : "grid-cols-3 gap-2"}`}>
          {mediaItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onSelect(item)}
              className="group relative aspect-square bg-gray-100 rounded-lg overflow-hidden hover:ring-2 hover:ring-alloro-orange transition border border-gray-200"
            >
              {item.thumbnail_s3_url || item.mime_type.startsWith("image/") ? (
                <img
                  src={item.thumbnail_s3_url || item.s3_url}
                  alt={item.display_name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Image className="w-6 h-6 text-gray-400" />
                </div>
              )}
              <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[10px] px-1 py-0.5 truncate opacity-0 group-hover:opacity-100 transition">
                {item.display_name}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
