import { PointerSensor, useSensor, useSensors } from "@dnd-kit/core";

const OS_DRAG_ACTIVATION_DISTANCE_PX = 6;

/**
 * Pointer sensor for the Library dnd views: a 6px activation distance keeps
 * plain clicks navigating while real drags still start immediately.
 */
export function useOsLibraryDndSensors() {
  return useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: OS_DRAG_ACTIVATION_DISTANCE_PX },
    }),
  );
}
