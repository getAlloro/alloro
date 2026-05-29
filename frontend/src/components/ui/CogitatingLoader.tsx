import { useEffect, useState } from "react";
import Lottie from "lottie-react";
import cogitatingSpinner from "../../assets/cogitating-spinner.json";

const COGITATING_PHRASES = [
  "Reading the leaves",
  "Turning over new leaves",
  "Tending the garden",
  "Pruning the branches",
  "Cultivating insights",
  "Planting seeds",
  "Watching things grow",
  "Raking through data",
  "Leafing through results",
  "Letting ideas bloom",
  "Branching out",
  "Nurturing the roots",
  "Gathering the harvest",
  "Composting old data",
  "Sprouting new insights",
  "Tracing the veins",
  "Following the canopy",
  "Photosynthesizing",
  "Unfurling the fronds",
  "Sowing the metrics",
  "Tilling the numbers",
  "Training the vines",
  "Feeding the algorithm",
  "Grafting the models",
  "Pollinating ideas",
  "Running the neural roots",
  "Warming the greenhouse",
  "Mapping the growth rings",
  "Distilling the nectar",
  "Shaking the branches",
];

export type CogitatingLoaderProps = {
  className?: string;
};

function CogitatingText() {
  const [targetPhrase, setTargetPhrase] = useState(
    () => COGITATING_PHRASES[Math.floor(Math.random() * COGITATING_PHRASES.length)],
  );
  const [displayed, setDisplayed] = useState("");
  const [isTyping, setIsTyping] = useState(true);

  useEffect(() => {
    if (isTyping) {
      if (displayed.length < targetPhrase.length) {
        const timeout = window.setTimeout(() => {
          setDisplayed(targetPhrase.slice(0, displayed.length + 1));
        }, 35);
        return () => window.clearTimeout(timeout);
      }
      const hold = window.setTimeout(() => setIsTyping(false), 1800);
      return () => window.clearTimeout(hold);
    }

    setTargetPhrase((previous) => {
      let next: string;
      do {
        next = COGITATING_PHRASES[
          Math.floor(Math.random() * COGITATING_PHRASES.length)
        ];
      } while (next === previous);
      return next;
    });
    setDisplayed("");
    setIsTyping(true);
  }, [displayed, isTyping, targetPhrase]);

  return (
    <p className="font-display text-sm font-semibold">
      <span className="cogitating-gradient">{displayed}</span>
      <span className="ml-[1px] inline-flex w-[1.5em] justify-start">
        <span className="cogitating-dot [animation-delay:0s]">.</span>
        <span className="cogitating-dot [animation-delay:0.15s]">.</span>
        <span className="cogitating-dot [animation-delay:0.3s]">.</span>
      </span>
    </p>
  );
}

export function CogitatingLoader({
  className = "flex-1",
}: CogitatingLoaderProps) {
  return (
    <div
      className={`${className} flex items-center justify-center bg-[#F7F5F3] font-body text-alloro-navy selection:bg-alloro-orange selection:text-white`}
    >
      <div className="text-center">
        <div className="relative mx-auto mb-2 flex h-16 w-16 items-center justify-center">
          <div className="absolute inset-0 animate-spin rounded-full border-[3px] border-alloro-orange/15 border-t-alloro-orange [animation-duration:1.2s]" />
          <Lottie
            animationData={cogitatingSpinner}
            loop
            className="relative z-10 h-9 w-9"
          />
        </div>
        <CogitatingText />
      </div>
    </div>
  );
}
