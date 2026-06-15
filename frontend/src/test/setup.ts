import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Unmount and clear the DOM between tests so renders don't leak across cases.
afterEach(() => {
  cleanup();
});
