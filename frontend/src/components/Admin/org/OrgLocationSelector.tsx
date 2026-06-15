import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, MapPin, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { AdminLocation } from "../../api/admin-organizations";

interface OrgLocationSelectorProps {
  locations: AdminLocation[];
  selectedLocation: AdminLocation | null;
  onSelect: (location: AdminLocation) => void;
}

interface TransitionOrigin {
  x: number;
  y: number;
}

export function OrgLocationSelector({
  locations,
  selectedLocation,
  onSelect,
}: OrgLocationSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [transitionOrigin, setTransitionOrigin] =
    useState<TransitionOrigin | null>(null);
  const [transitionLocationName, setTransitionLocationName] = useState<
    string | null
  >(null);
  const [buttonRect, setButtonRect] = useState<DOMRect | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (locations.length === 1 && !selectedLocation) {
      onSelect(locations[0]);
    }
  }, [locations, selectedLocation, onSelect]);

  const handleSelect = (location: AdminLocation) => {
    if (location.id === selectedLocation?.id) {
      setIsOpen(false);
      return;
    }

    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setButtonRect(rect);
      setTransitionOrigin({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      });
      setTransitionLocationName(location.name);
      setIsTransitioning(true);
      setIsOpen(false);

      setTimeout(() => {
        onSelect(location);
      }, 400);

      setTimeout(() => {
        setIsTransitioning(false);
        setTransitionOrigin(null);
        setTransitionLocationName(null);
        setButtonRect(null);
      }, 1200);
    } else {
      onSelect(location);
      setIsOpen(false);
    }
  };

  if (locations.length <= 1) return null;

  const buttonContent = (
    <>
      <MapPin className="h-4 w-4 shrink-0" />
      <span className="font-medium truncate">
        {selectedLocation?.name || "Select location"}
      </span>
      <ChevronDown className="h-4 w-4 shrink-0 ml-1" />
    </>
  );

  return (
    <>
      {/* Inline dropdown button */}
      <div className="relative">
        <motion.button
          ref={buttonRef}
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 rounded-xl bg-[#212D40] px-4 py-2.5 text-sm text-white hover:bg-[#2a3a50] transition-colors whitespace-nowrap"
        >
          {buttonContent}
        </motion.button>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute top-full right-0 mt-2 z-50 min-w-[220px] rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden"
            >
              <div className="max-h-48 overflow-y-auto">
                {locations.map((location) => (
                  <button
                    key={location.id}
                    onClick={() => handleSelect(location)}
                    className={`w-full px-4 py-3 text-left border-b border-gray-100 last:border-b-0 hover:bg-alloro-orange/5 transition-colors ${
                      selectedLocation?.id === location.id
                        ? "bg-alloro-orange/10 border-l-2 border-l-alloro-orange"
                        : ""
                    }`}
                  >
                    <div className="font-medium text-gray-900">
                      {location.name}
                    </div>
                    {location.is_primary && (
                      <div className="text-xs text-alloro-orange font-medium">
                        Primary Location
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Portal: floating button clone above the splash overlay */}
      {isTransitioning &&
        buttonRect &&
        createPortal(
          <motion.div
            className="pointer-events-none"
            style={{
              position: "fixed",
              top: buttonRect.top,
              left: buttonRect.left,
              width: buttonRect.width,
              height: buttonRect.height,
              zIndex: 95,
            }}
            animate={{ scale: [1, 1.06, 0.97, 1.04, 1] }}
            transition={{
              duration: 0.8,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            <div className="w-full h-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-[#212D40] rounded-xl shadow-lg">
              {buttonContent}
            </div>
          </motion.div>,
          document.body,
        )}

      {/* Splash Transition Overlay */}
      <AnimatePresence>
        {isTransitioning && transitionOrigin && (
          <motion.div
            key="location-transition"
            className="fixed inset-0 z-[90] pointer-events-none"
            initial={{
              clipPath: `circle(0px at ${transitionOrigin.x}px ${transitionOrigin.y}px)`,
            }}
            animate={{
              clipPath: `circle(200vmax at ${transitionOrigin.x}px ${transitionOrigin.y}px)`,
            }}
            exit={{
              clipPath: `circle(0px at ${transitionOrigin.x}px ${transitionOrigin.y}px)`,
              opacity: 0,
              transition: { duration: 0.35, ease: "easeIn" },
            }}
            transition={{
              duration: 0.4,
              ease: "easeInOut",
            }}
          >
            <div
              className="w-full h-full flex items-center justify-center"
              style={{
                background:
                  "radial-gradient(ellipse at center, #d66853 0%, #c45a47 100%)",
              }}
            >
              <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.3 }}
                className="text-center space-y-6"
              >
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    ease: "linear",
                  }}
                >
                  <Loader2 className="w-14 h-14 text-white/90 mx-auto" />
                </motion.div>
                <p className="text-lg font-semibold text-white/90 tracking-wide">
                  Switching to {transitionLocationName || "location"}...
                </p>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
