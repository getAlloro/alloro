import { useEffect, useRef, useState } from "react";
import {
  getClickMotion,
  getNeutralMotion,
  RAGE_PROMPT_MS,
  recordRageClick,
  type RageClick,
} from "../../utils/supportRageClick";

export type UseRageClickPromptOptions = {
  disabled: boolean;
  anchorElementRef: { current: HTMLElement | null };
  ignoredElementRef: { current: HTMLElement | null };
};

export function useRageClickPrompt({
  anchorElementRef,
  disabled,
  ignoredElementRef,
}: UseRageClickPromptOptions) {
  const clicksRef = useRef<RageClick[]>([]);
  const timeoutRef = useRef<number | null>(null);
  const [isPromptVisible, setIsPromptVisible] = useState(false);
  const [rageMotion, setRageMotion] = useState(getNeutralMotion());
  const [shakeKey, setShakeKey] = useState(0);

  useEffect(() => {
    if (disabled) {
      clicksRef.current = [];
      setIsPromptVisible(false);
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      if (ignoredElementRef.current?.contains(event.target as Node)) return;

      if (!recordRageClick(clicksRef.current, event)) return;
      setRageMotion(getClickMotion(event, anchorElementRef.current));
      setShakeKey((current) => current + 1);
      setIsPromptVisible(true);
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => setIsPromptVisible(false), RAGE_PROMPT_MS);
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
  }, [anchorElementRef, disabled, ignoredElementRef]);

  return { isPromptVisible, rageMotion, shakeKey };
}
