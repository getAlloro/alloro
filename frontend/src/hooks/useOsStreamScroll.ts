import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Stream-following auto-scroll for the OS chat transcript
 * (plans/07042026-alloro-os-admin-port P5 T4; port of alloro-os
 * useStreamScroll). While the reader is pinned to the bottom, new tokens keep
 * the view glued there; once they scroll up, following stops so reading isn't
 * yanked, and `atBottom` flips false to reveal the "Jump to latest" pill.
 * `deps` are the content-growth signals (message count, the live message's
 * length, the streaming flag).
 */

const OS_BOTTOM_THRESHOLD_PX = 80;

export type OsStreamScroll = {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  endRef: React.RefObject<HTMLDivElement | null>;
  atBottom: boolean;
  onScroll: () => void;
  scrollToBottom: () => void;
};

export function useOsStreamScroll(
  deps: ReadonlyArray<unknown>,
): OsStreamScroll {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const following = useRef(true);
  const [atBottom, setAtBottom] = useState(true);

  const scrollToBottom = useCallback(() => {
    following.current = true;
    setAtBottom(true);
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, []);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    const isAtBottom = distance < OS_BOTTOM_THRESHOLD_PX;
    following.current = isAtBottom;
    setAtBottom(isAtBottom);
  }, []);

  // Re-glue to the bottom on any content-growth signal while following. Spreading
  // the caller-supplied dep array is the intended contract here.
  useEffect(() => {
    if (following.current) {
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { scrollRef, endRef, atBottom, onScroll, scrollToBottom };
}
