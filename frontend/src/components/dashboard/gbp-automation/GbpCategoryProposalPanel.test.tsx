import { useState } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { ApiError } from "../../../api";
import { GbpCategoryProposalPanel } from "./GbpCategoryProposalPanel";
import type { GbpCategoryProposalResult } from "../../../api/gbpAutomation";

// Mock the actions hook so the six render states are drivable without a
// QueryClient — mirrors focus/AlloroActivitySummary.test.tsx.
vi.mock("../../../hooks/queries/useGbpAutomationQueries", () => ({
  useGbpCategoryProposalActions: vi.fn(),
}));

import { useGbpCategoryProposalActions } from "../../../hooks/queries/useGbpAutomationQueries";
const mockActions = vi.mocked(useGbpCategoryProposalActions);

type Actions = ReturnType<typeof useGbpCategoryProposalActions>;

/** An idle useMutation-shaped stub. Overrides pick one state at a time. */
function mutationStub(over: Record<string, unknown> = {}) {
  return {
    mutate: vi.fn(),
    reset: vi.fn(),
    data: undefined,
    error: null,
    isPending: false,
    isSuccess: false,
    isError: false,
    ...over,
  };
}

function actions(over: {
  propose?: Record<string, unknown>;
  approve?: Record<string, unknown>;
  dismiss?: Record<string, unknown>;
} = {}): Actions {
  return {
    propose: mutationStub(over.propose),
    approve: mutationStub(over.approve),
    dismiss: mutationStub(over.dismiss),
  } as unknown as Actions;
}

const proposedResult = (suggested: string): GbpCategoryProposalResult =>
  ({
    proposed: true,
    recommendation: {
      current: { displayName: "Dentist", categoryId: "gcid:dentist" },
      proposed: { displayName: suggested, categoryId: "gcid:suggested" },
      rationale: "Most of your reviews mention root canals, which is a narrower service.",
    },
    workItem: { id: "wi-1" },
  }) as unknown as GbpCategoryProposalResult;

describe("GbpCategoryProposalPanel", () => {
  beforeEach(() => {
    mockActions.mockReset();
  });

  it("disables the trigger and explains why with no location selected", () => {
    mockActions.mockReturnValue(actions());
    render(<GbpCategoryProposalPanel organizationId={1} locationId={null} />);

    expect(screen.getByText("Select a location first.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Review my category/i })).toBeDisabled();
  });

  it("renders current → suggested and the rationale for a proposed result", () => {
    mockActions.mockReturnValue(
      actions({ propose: { data: proposedResult("Endodontist"), isSuccess: true } }),
    );
    render(<GbpCategoryProposalPanel organizationId={1} locationId={5} />);

    expect(screen.getByText("Dentist")).toBeInTheDocument();
    expect(screen.getByText("Endodontist")).toBeInTheDocument();
    expect(screen.getByText(/Most of your reviews mention root canals/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Approve this change/i })).toBeInTheDocument();
  });

  it("renders the honest empty state when nothing better fits", () => {
    mockActions.mockReturnValue(
      actions({
        propose: {
          data: { proposed: false } as unknown as GbpCategoryProposalResult,
          isSuccess: true,
        },
      }),
    );
    render(<GbpCategoryProposalPanel organizationId={1} locationId={5} />);

    expect(screen.getByText("Your category already fits")).toBeInTheDocument();
    // An honest empty is NOT a manufactured change: no approve/dismiss controls.
    expect(screen.queryByRole("button", { name: /Approve this change/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Dismiss$/i })).toBeNull();
  });

  it("renders the calm gated state, not a raw error, when write-back is off", () => {
    mockActions.mockReturnValue(
      actions({
        propose: {
          error: new ApiError("Business info write-back is disabled for location 5.", {
            code: "BUSINESS_INFO_WRITEBACK_DISABLED",
          }),
          isError: true,
        },
      }),
    );
    render(<GbpCategoryProposalPanel organizationId={1} locationId={5} />);

    expect(screen.getByText("Category review isn't switched on yet")).toBeInTheDocument();
    // FALSIFIER: the raw backend sentence must not reach the owner (§3.4).
    expect(screen.queryByText(/write-back is disabled/i)).toBeNull();
    expect(screen.queryByText("We could not review your category")).toBeNull();
  });

  it("surfaces the gated message on an approve rejection too", () => {
    mockActions.mockReturnValue(
      actions({
        propose: { data: proposedResult("Endodontist"), isSuccess: true },
        approve: {
          error: new ApiError("Business info write-back is disabled for location 5.", {
            code: "BUSINESS_INFO_WRITEBACK_DISABLED",
          }),
          isError: true,
        },
      }),
    );
    render(<GbpCategoryProposalPanel organizationId={1} locationId={5} />);

    expect(screen.getByText(/is not switched on for this location yet/)).toBeInTheDocument();
    expect(screen.getByText(/stays saved as a draft/)).toBeInTheDocument();
  });

  it("gives visible feedback when dismiss fails", () => {
    mockActions.mockReturnValue(
      actions({
        propose: { data: proposedResult("Endodontist"), isSuccess: true },
        dismiss: { error: new Error("boom"), isError: true },
      }),
    );
    render(<GbpCategoryProposalPanel organizationId={1} locationId={5} />);

    expect(
      screen.getByText(/We could not dismiss this suggestion right now/),
    ).toBeInTheDocument();
  });

  it("does not claim an approved change is on its way to Google", () => {
    mockActions.mockReturnValue(
      actions({
        propose: { data: proposedResult("Endodontist"), isSuccess: true },
        approve: { isSuccess: true },
      }),
    );
    render(<GbpCategoryProposalPanel organizationId={1} locationId={5} />);

    expect(screen.getByText("Change approved")).toBeInTheDocument();
    // FALSIFIER: approving only records a decision — GbpBusinessInfoDeploymentService
    // .approve flips status and writes an audit event, and no worker calls deploy.
    // "ready to publish" invites an inference this UI does not honour.
    expect(screen.queryByText(/ready to publish/i)).toBeNull();
    expect(screen.getByText(/Nothing has been sent to Google/i)).toBeInTheDocument();
  });

  it("keeps a retry button disabled when no location is selected", () => {
    // The primary trigger is location-guarded; the retry buttons run the SAME
    // proposal call, which asserts locationId! — so they need the same guard.
    mockActions.mockReturnValue(
      actions({
        propose: {
          data: { proposed: false } as unknown as GbpCategoryProposalResult,
          isSuccess: true,
        },
      }),
    );
    render(<GbpCategoryProposalPanel organizationId={1} locationId={null} />);

    expect(screen.getByRole("button", { name: /Check again/i })).toBeDisabled();
  });
});

/**
 * F1 — the cross-office correctness bug.
 *
 * React Query mutation state is not keyed by locationId and nothing resets it
 * when the office selector changes, so a proposal staged for office A survives
 * a switch to office B. The owner then reads A's suggested category under B's
 * frame and clicks Approve; rbac accepts B (it is accessible) and
 * findScopedWorkItem accepts work item A (A is in accessibleLocationIds), so
 * the approval lands on office A with no error.
 *
 * The mock below simulates real mutation semantics: state held in useState
 * belongs to the hook INSTANCE, exactly like useMutation's. It survives a prop
 * change and is discarded on remount — so this suite genuinely falsifies the
 * bug rather than restating the fix.
 */
describe("GbpCategoryProposalPanel across an office switch", () => {
  beforeEach(() => {
    mockActions.mockReset();
    mockActions.mockImplementation(((_orgId: number | null, locationId?: number | null) => {
      const [data, setData] = useState<GbpCategoryProposalResult | undefined>(undefined);
      return {
        propose: {
          ...mutationStub(),
          data,
          isSuccess: data !== undefined,
          mutate: () => setData(proposedResult(`Suggested for office ${locationId}`)),
        },
        approve: mutationStub(),
        dismiss: mutationStub(),
      } as unknown as Actions;
    }) as typeof useGbpCategoryProposalActions);
  });

  it("FALSIFIER: a proposal staged for office A does not survive a switch to office B", () => {
    const { rerender } = render(
      <GbpCategoryProposalPanel organizationId={1} locationId={1} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Review my category/i }));
    expect(screen.getByText("Suggested for office 1")).toBeInTheDocument();

    rerender(<GbpCategoryProposalPanel organizationId={1} locationId={2} />);

    // Office 1's suggestion must be gone — approving it here would record the
    // owner's consent against an office they are no longer looking at.
    expect(screen.queryByText("Suggested for office 1")).toBeNull();
    expect(screen.queryByRole("button", { name: /Approve this change/i })).toBeNull();
    // Back to the intro state for the newly selected office.
    expect(screen.getByRole("button", { name: /Review my category/i })).toBeInTheDocument();
  });

  it("keeps a staged proposal while the location is unchanged", () => {
    // The over-reset guard: a re-render for any other reason must not throw
    // away work the owner is mid-way through reviewing.
    const { rerender } = render(
      <GbpCategoryProposalPanel organizationId={1} locationId={1} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Review my category/i }));
    expect(screen.getByText("Suggested for office 1")).toBeInTheDocument();

    rerender(<GbpCategoryProposalPanel organizationId={1} locationId={1} />);

    expect(screen.getByText("Suggested for office 1")).toBeInTheDocument();
  });
});
