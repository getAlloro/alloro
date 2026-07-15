import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const hookMocks = vi.hoisted(() => ({
  useTopAction: vi.fn(),
  useIsWizardActive: vi.fn(),
}));

vi.mock("framer-motion", () => ({
  motion: {
    section: ({
      children,
      initial: _initial,
      animate: _animate,
      transition: _transition,
      ...props
    }: ComponentProps<"section"> & {
      initial?: unknown;
      animate?: unknown;
      transition?: unknown;
    }) => {
      void _initial;
      void _animate;
      void _transition;
      return <section {...props}>{children}</section>;
    },
  },
  useReducedMotion: () => true,
}));
vi.mock("../../../hooks/useAuth", () => ({
  useAuth: () => ({
    userProfile: {
      organizationId: 7,
      organizationType: "dental",
    },
  }),
}));
vi.mock("../../../contexts/locationContext", () => ({
  useLocationContext: () => ({ selectedLocation: { id: 11 } }),
}));
vi.mock("../../../contexts/OnboardingWizardContext", () => ({
  useIsWizardActive: () => hookMocks.useIsWizardActive(),
}));
vi.mock("../../../hooks/queries/useTopAction", () => ({
  useTopAction: () => hookMocks.useTopAction(),
}));

import { ChoosableComparisonStrip } from "./ChoosableComparisonStrip";

beforeEach(() => {
  vi.clearAllMocks();
  hookMocks.useIsWizardActive.mockReturnValue(false);
  hookMocks.useTopAction.mockReturnValue({
    latestChoosableSummary: null,
    isLoading: false,
    error: null,
  });
});

describe("ChoosableComparisonStrip", () => {
  it("renders the grounded latest Summary without a CTA", () => {
    hookMocks.useTopAction.mockReturnValue({
      latestChoosableSummary: {
        domain: "review",
        heading: "Local review comparison",
        summary: "Your review volume is at the local median.",
        detail: "You have 550 reviews; Apex Dental has 1,000.",
        supporting_metrics: [],
      },
      isLoading: false,
      error: null,
    });

    render(<ChoosableComparisonStrip />);
    expect(screen.getByRole("region", { name: "Local review comparison" })).toBeInTheDocument();
    expect(screen.getByText("Your review volume is at the local median.")).toBeInTheDocument();
    expect(screen.getByText(/Apex Dental has 1,000/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("shows only a neutral loading skeleton while the task feed loads", () => {
    hookMocks.useTopAction.mockReturnValue({
      latestChoosableSummary: null,
      isLoading: true,
      error: null,
    });
    render(<ChoosableComparisonStrip />);
    expect(screen.getByLabelText("Loading local review comparison")).toHaveAttribute(
      "aria-busy",
      "true"
    );
    expect(screen.queryByText(/Apex Dental/)).toBeNull();
  });

  it.each([
    ["empty", null],
    ["error", new Error("task feed unavailable")],
  ])("renders nothing for the %s state", (_state, error) => {
    hookMocks.useTopAction.mockReturnValue({
      latestChoosableSummary: null,
      isLoading: false,
      error,
    });
    const { container } = render(<ChoosableComparisonStrip />);
    expect(container).toBeEmptyDOMElement();
  });

  it("stays hidden during onboarding", () => {
    hookMocks.useIsWizardActive.mockReturnValue(true);
    hookMocks.useTopAction.mockReturnValue({
      latestChoosableSummary: {
        domain: "review",
        heading: "Local review comparison",
        summary: "Comparison",
        detail: "Grounded detail",
        supporting_metrics: [],
      },
      isLoading: false,
      error: null,
    });
    const { container } = render(<ChoosableComparisonStrip />);
    expect(container).toBeEmptyDOMElement();
  });
});
