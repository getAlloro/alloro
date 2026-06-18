import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CogitatingLoader } from "./CogitatingLoader";

// Mock the animation library — we smoke-test CogitatingLoader's own rendering,
// not lottie-web's canvas/SVG internals (which don't belong in a unit test).
vi.mock("lottie-react", () => ({
  default: () => <div data-testid="lottie-spinner" />,
}));

describe("CogitatingLoader (smoke render)", () => {
  it("mounts without crashing and renders its spinner", () => {
    render(<CogitatingLoader />);
    expect(screen.getByTestId("lottie-spinner")).toBeInTheDocument();
  });
});
