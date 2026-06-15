import { useEffect, useState } from "react";
import { COGITATING_PHRASES } from "../pmsVisualPillars.utils";

export function CogitatingText() {
  const [targetPhrase, setTargetPhrase] = useState(() =>
    COGITATING_PHRASES[Math.floor(Math.random() * COGITATING_PHRASES.length)]
  );
  const [displayed, setDisplayed] = useState("");
  const [isTyping, setIsTyping] = useState(true);

  useEffect(() => {
    if (isTyping) {
      if (displayed.length < targetPhrase.length) {
        const t = setTimeout(
          () => setDisplayed(targetPhrase.slice(0, displayed.length + 1)),
          35
        );
        return () => clearTimeout(t);
      }
      const hold = setTimeout(() => setIsTyping(false), 1800);
      return () => clearTimeout(hold);
    }
    setTargetPhrase((prev) => {
      let next: string;
      do {
        next = COGITATING_PHRASES[Math.floor(Math.random() * COGITATING_PHRASES.length)];
      } while (next === prev);
      return next;
    });
    setDisplayed("");
    setIsTyping(true);
  }, [displayed, isTyping, targetPhrase]);

  return (
    <p className="font-semibold text-sm font-display">
      <span className="cogitating-gradient">{displayed}</span>
      <span className="inline-flex w-[1.5em] justify-start ml-[1px]">
        <span className="cogitating-dot" style={{ animationDelay: "0s" }}>.</span>
        <span className="cogitating-dot" style={{ animationDelay: "0.15s" }}>.</span>
        <span className="cogitating-dot" style={{ animationDelay: "0.3s" }}>.</span>
      </span>
    </p>
  );
}
