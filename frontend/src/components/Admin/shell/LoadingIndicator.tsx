import { useEffect, useState, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Top-bar loading indicator for page transitions
 * Shows an animated progress bar at the top of the page during navigation
 */
export function LoadingIndicator() {
  const location = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(0);
  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const previousLocationRef = useRef(location.pathname + location.search);
  const minDisplayTimeRef = useRef<NodeJS.Timeout | null>(null);
  const canCompleteRef = useRef(true);

  // Start loading - immediately show progress
  const startLoading = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    if (minDisplayTimeRef.current) {
      clearTimeout(minDisplayTimeRef.current);
    }

    progressRef.current = 0;
    startTimeRef.current = Date.now();
    canCompleteRef.current = false;
    setProgress(20); // Start at 20% immediately for visibility
    setIsLoading(true);

    // Minimum display time of 300ms so it's visible
    minDisplayTimeRef.current = setTimeout(() => {
      canCompleteRef.current = true;
    }, 300);
  }, []);

  // Complete loading
  const completeLoading = useCallback(() => {
    if (!canCompleteRef.current) {
      // Wait for minimum display time
      const checkAndComplete = () => {
        if (canCompleteRef.current) {
          if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
            animationRef.current = null;
          }
          setProgress(100);
          setTimeout(() => {
            setIsLoading(false);
            setProgress(0);
            progressRef.current = 0;
          }, 200);
        } else {
          setTimeout(checkAndComplete, 50);
        }
      };
      checkAndComplete();
      return;
    }

    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    setProgress(100);
    // Hide after animation completes
    setTimeout(() => {
      setIsLoading(false);
      setProgress(0);
      progressRef.current = 0;
    }, 200);
  }, []);

  // Handle navigation completion - detect when location actually changes
  useEffect(() => {
    const currentLocation = location.pathname + location.search;
    if (previousLocationRef.current !== currentLocation) {
      previousLocationRef.current = currentLocation;
      if (isLoading) {
        completeLoading();
      }
    }
  }, [location.pathname, location.search, isLoading, completeLoading]);

  // Animate progress
  useEffect(() => {
    if (isLoading && progress < 90) {
      const animate = () => {
        const elapsed = Date.now() - startTimeRef.current;
        // Fast start, then slow down - reaches ~85% in about 3 seconds
        const targetProgress = Math.min(90, 20 + (70 * (1 - Math.exp(-elapsed / 1500))));

        if (targetProgress > progressRef.current) {
          progressRef.current = targetProgress;
          setProgress(targetProgress);
        }

        if (progressRef.current < 90) {
          animationRef.current = requestAnimationFrame(animate);
        }
      };

      animationRef.current = requestAnimationFrame(animate);

      return () => {
        if (animationRef.current) {
          cancelAnimationFrame(animationRef.current);
        }
      };
    }
  }, [isLoading, progress]);

  // Listen for navigation start (clicks on internal links)
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest('a');

      if (anchor) {
        const href = anchor.getAttribute('href');
        // Only trigger for internal navigation links (React Router uses href attribute)
        if (href && href.startsWith('/') && !href.startsWith('//')) {
          const currentPath = window.location.pathname;
          // Compare just the pathname part
          const targetPath = href.split('?')[0];
          if (targetPath !== currentPath) {
            startLoading();
          }
        }
      }
    };

    // Also listen for programmatic navigation via custom event
    const handleNavigationStart = () => {
      startLoading();
    };

    const handleNavigationComplete = () => {
      completeLoading();
    };

    document.addEventListener('click', handleClick, true); // Use capture phase
    window.addEventListener('navigation-start', handleNavigationStart);
    window.addEventListener('navigation-complete', handleNavigationComplete);

    return () => {
      document.removeEventListener('click', handleClick, true);
      window.removeEventListener('navigation-start', handleNavigationStart);
      window.removeEventListener('navigation-complete', handleNavigationComplete);
    };
  }, [startLoading, completeLoading]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (minDisplayTimeRef.current) {
        clearTimeout(minDisplayTimeRef.current);
      }
    };
  }, []);

  if (!isLoading && progress === 0) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] h-[3px] pointer-events-none">
      {/* Background track */}
      <div className="absolute inset-0 bg-orange-100" />
      {/* Progress bar */}
      <div
        className="absolute top-0 left-0 h-full bg-gradient-to-r from-alloro-orange via-orange-400 to-orange-300"
        style={{
          width: `${progress}%`,
          transition: progress === 100
            ? 'width 150ms ease-out'
            : progress === 20
            ? 'width 0ms' // Instant start
            : 'width 200ms ease-out',
          boxShadow: '0 0 12px rgba(214, 104, 83, 0.9), 0 0 6px rgba(214, 104, 83, 0.7)',
        }}
      />
      {/* Animated glow pulse at the end of the bar */}
      <div
        className="absolute top-0 h-full w-32 animate-pulse"
        style={{
          left: `calc(${progress}% - 64px)`,
          background: 'linear-gradient(90deg, transparent, rgba(214, 104, 83, 0.8), transparent)',
          transition: progress === 100 ? 'left 150ms ease-out' : 'left 200ms ease-out',
        }}
      />
    </div>
  );
}
