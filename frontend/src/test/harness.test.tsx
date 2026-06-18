import { describe, it, expect } from "vitest";
import { renderWithProviders, screen } from "./test-utils";

// Sanity check: proves the runner, jsdom, jest-dom matchers, and the shared
// provider wrapper all work end to end. If this fails, the harness is broken,
// not the code under test.
describe("test harness", () => {
  it("renders a component through the provider wrapper", () => {
    renderWithProviders(<div>harness ok</div>);
    expect(screen.getByText("harness ok")).toBeInTheDocument();
  });
});
