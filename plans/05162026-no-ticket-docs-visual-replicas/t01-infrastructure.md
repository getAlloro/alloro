# T1: Infrastructure — Types, DesktopViewport, HotspotZone

## Why
The docs app currently renders static screenshot images with percentage-based hotspot overlays. We're replacing this with live React component replicas. This task builds the foundational infrastructure: updated types, a scaled desktop viewport container, and an inline hotspot wrapper component.

## What
Update the type system, create `DesktopViewport` and `HotspotZone` components, update `DocPageTemplate` to use them, and delete the old screenshot/overlay components.

## Context

**Files to modify:**
- `docs/src/types/docs.ts` — current types include `Screenshot`, `ZoomRegion`, `fullScreenshot`, `zoomRegions`
- `docs/src/components/DocPageTemplate.tsx` — currently uses `ScreenshotViewer`
- `docs/src/components/HotspotTooltip.tsx` — keep as-is, reused by `HotspotZone`

**Files to delete:**
- `docs/src/components/ScreenshotViewer.tsx`
- `docs/src/components/HotspotOverlay.tsx`

**Files to create:**
- `docs/src/components/DesktopViewport.tsx`
- `docs/src/components/HotspotZone.tsx`

**Brand tokens:** `alloro-navy`, `alloro-orange`, `alloro-orange-light`, `alloro-slate`, `alloro-border`
**Existing deps:** react, tailwind 4, framer-motion, lucide-react, clsx

## Constraints

- Do NOT import anything from `../frontend/`
- Do NOT add new npm dependencies
- `HotspotTooltip.tsx` stays as-is — `HotspotZone` reuses it

## Tasks

### 1. Update `docs/src/types/docs.ts`
- Remove `Screenshot` interface
- Remove `ZoomRegion` interface
- Remove `fullScreenshot` and `zoomRegions` from `DocPage`
- Remove `zoomRegionId` from `DocStep`
- Add to `DocPage`: `replica: React.ComponentType<ReplicaProps>` (or use a string key — see note below)

**Replica props interface** (add to types):
```typescript
export interface ReplicaProps {
  hotspots: Hotspot[];
  activeHotspotId: string | null;
  onHotspotClick: (hotspot: Hotspot) => void;
}
```

### 2. Create `docs/src/components/DesktopViewport.tsx`
- Renders children at **1440px width** inside a container
- Uses CSS `transform: scale()` calculated from the container's actual width (use a `ResizeObserver` or a fixed scale like `0.6`)
- **Browser window chrome** at the top: rounded top corners, three colored dots (red/yellow/green), centered title text
- The scaled inner area has `max-height: 600px` (after scaling) with `overflow-y: auto` for scrollable content
- Accepts `children` (the replica component)
- Wrapper has `rounded-2xl overflow-hidden border border-alloro-border shadow-lg`

### 3. Create `docs/src/components/HotspotZone.tsx`
Wraps a section of replica content with interactive hotspot behavior.

**Props:**
```typescript
interface HotspotZoneProps {
  id: string;
  hotspot?: Hotspot;         // the hotspot data (label, description, step, action)
  isActive: boolean;         // controlled by parent (step panel clicks)
  onHotspotClick?: (hotspot: Hotspot) => void;
  children: React.ReactNode;
}
```

**Behavior:**
- Wraps children in a `relative` div
- On hover or when active: shows orange highlight border (`border-2 border-alloro-orange`), subtle orange background tint
- Step badge: small numbered circle at top-left (matches current `HotspotOverlay` badge style)
- Tooltip: renders `HotspotTooltip` on hover/active (positioned below or above the zone)
- When inactive and not hovered: transparent/invisible border, no visual noise

### 4. Update `docs/src/components/DocPageTemplate.tsx`
- Remove `ScreenshotViewer` import and usage
- Remove zoom-related state (`ZoomIn` icon import, zoom step references)
- Import `DesktopViewport`
- Render: `<DesktopViewport>` wrapping `<page.replica hotspots={...} activeHotspotId={...} onHotspotClick={...} />`
- The step panel remains unchanged — clicking a step sets `activeHotspotId` which propagates to the replica's `HotspotZone` components
- Remove the "Interactive — hover or click highlighted areas" label since the zones are self-explanatory (or keep it, either way)

### 5. Delete files
- `docs/src/components/ScreenshotViewer.tsx` — no longer needed
- `docs/src/components/HotspotOverlay.tsx` — replaced by `HotspotZone`

## Verify
- TypeScript: will have import errors in page configs (expected — T15 fixes those)
- `DesktopViewport` renders a scaled container with browser chrome
- `HotspotZone` shows highlight + tooltip on hover

## Depends on
None
