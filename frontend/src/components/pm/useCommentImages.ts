import { useCallback, useEffect, useRef, useState } from "react";
import type { SelectedCommentImage } from "./commentComposer.types";
const MAX_COMMENT_IMAGES = 6;

export function useCommentImages(isEnabled: boolean) {
  const [images, setImages] = useState<SelectedCommentImage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const imagesRef = useRef(images);
  imagesRef.current = images;
  useEffect(
    () => () => imagesRef.current.forEach(({ previewUrl }) => URL.revokeObjectURL(previewUrl)),
    [],
  );
  const addFiles = useCallback(
    (files: File[]) => {
      if (!isEnabled || files.length === 0) return;
      const accepted = files.filter((file) => file.type.startsWith("image/"));
      setError(accepted.length === files.length ? null : "Only image files can be attached to comments.");
      setImages((current) => {
        const available = Math.max(0, MAX_COMMENT_IMAGES - current.length);
        if (available === 0) {
          setError(`You can attach up to ${MAX_COMMENT_IMAGES} images per comment.`);
          return current;
        }
        if (accepted.length > available) {
          setError(`Only the first ${MAX_COMMENT_IMAGES} images were attached.`);
        }
        return [...current, ...accepted.slice(0, available).map((file, index) => ({
          id: `${file.name}-${file.lastModified}-${Date.now()}-${index}`,
          file,
          previewUrl: URL.createObjectURL(file),
        }))];
      });
    },
    [isEnabled],
  );
  const removeImage = useCallback((id: string) => {
    setImages((current) => {
      const removed = current.find((image) => image.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return current.filter((image) => image.id !== id);
    });
  }, []);
  const clearImages = useCallback(() => {
    setImages((current) => {
      current.forEach(({ previewUrl }) => URL.revokeObjectURL(previewUrl));
      return [];
    });
    setError(null);
  }, []);
  return { images, error, addFiles, removeImage, clearImages };
}
