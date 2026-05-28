export const RAGE_CLICK_COUNT = 4;
export const RAGE_CLICK_RADIUS_PX = 42;
export const RAGE_CLICK_WINDOW_MS = 900;
export const RAGE_PROMPT_MS = 3000;

export type RageClick = {
  x: number;
  y: number;
  time: number;
};

export type RageClickMotion = {
  x: number;
  y: number;
  rotate: number;
};

export function isNearbyRecentClick(
  click: RageClick,
  event: PointerEvent,
  now: number,
): boolean {
  const isRecent = now - click.time <= RAGE_CLICK_WINDOW_MS;
  return isRecent && getClickDistance(click, event) <= RAGE_CLICK_RADIUS_PX;
}

export function recordRageClick(clicks: RageClick[], event: PointerEvent): boolean {
  const now = Date.now();
  const nearbyClicks = clicks.filter((click) =>
    isNearbyRecentClick(click, event, now),
  );
  clicks.splice(0, clicks.length, ...nearbyClicks, {
    x: event.clientX,
    y: event.clientY,
    time: now,
  });
  if (clicks.length < RAGE_CLICK_COUNT) return false;
  clicks.splice(0, clicks.length);
  return true;
}

export function getClickMotion(
  event: PointerEvent,
  anchor: HTMLElement | null,
): RageClickMotion {
  if (!anchor) return getNeutralMotion();
  const rect = anchor.getBoundingClientRect();
  const distanceX = event.clientX - (rect.left + rect.width / 2);
  const distanceY = event.clientY - (rect.top + rect.height / 2);
  const distance = Math.hypot(distanceX, distanceY) || 1;
  const unitX = distanceX / distance;
  const unitY = distanceY / distance;
  return {
    x: Number((unitX * 5).toFixed(2)),
    y: Number((unitY * 4).toFixed(2)),
    rotate: Number((unitX * 8).toFixed(2)),
  };
}

export function getNeutralMotion(): RageClickMotion {
  return { x: 0, y: 0, rotate: 0 };
}

function getClickDistance(click: RageClick, event: PointerEvent): number {
  return Math.hypot(click.x - event.clientX, click.y - event.clientY);
}
