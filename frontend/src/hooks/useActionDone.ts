import { useCallback, useMemo, useState } from "react";

/**
 * useActionDone — lightweight "Mark done" state for the hubs' 1-action
 * banners. Purely client-side: localStorage keyed by hub + a hash of the
 * action text, so a NEW action (different text) brings the banner back
 * while the completed one stays collapsed across reloads.
 *
 * Spec: plans/06112026-design-consistency-pass (lightweight reveal-next —
 * no backend pool; the next action arrives with the next analysis run).
 */

function actionKey(hub: string, actionText: string): string {
  let hash = 5381;
  for (let i = 0; i < actionText.length; i += 1) {
    hash = ((hash << 5) + hash + actionText.charCodeAt(i)) | 0;
  }
  return `alloro.action-done.${hub}.${hash}`;
}

function readDone(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function useActionDone(hub: string, actionText: string | null | undefined) {
  // Session fallback: keeps the banner collapsed even when localStorage is
  // unavailable (private mode) and the write silently fails.
  const [sessionDoneKey, setSessionDoneKey] = useState<string | null>(null);
  const key = actionText?.trim() ? actionKey(hub, actionText.trim()) : null;

  const isDone = useMemo(
    () => (key ? readDone(key) || sessionDoneKey === key : false),
    [key, sessionDoneKey]
  );

  const markDone = useCallback(() => {
    if (!key) return;
    try {
      window.localStorage.setItem(key, "1");
    } catch {
      // Ignore — sessionDoneKey below still collapses for this session.
    }
    setSessionDoneKey(key);
  }, [key]);

  return { isDone, markDone };
}
