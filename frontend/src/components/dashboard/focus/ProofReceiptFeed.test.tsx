import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProofReceiptFeed } from "./ProofReceiptFeed";
import type { ProofReceipt } from "../../../types/proofReceipt";

// Mock the hook so we control the data without a full QueryClient stack —
// mirrors AlloroActivitySummary.test.tsx, the sibling proof-receipt consumer.
vi.mock("../../../hooks/queries/useProofReceipt", () => ({
  useProofReceipt: vi.fn(),
}));

// The component self-fetches org/location from these contexts; stub both so it
// renders with a known scope.
vi.mock("../../../hooks/useAuth", () => ({
  useAuth: vi.fn(() => ({ userProfile: { organizationId: 1 } })),
}));
vi.mock("../../../contexts/locationContext", () => ({
  useLocationContext: vi.fn(() => ({ selectedLocation: { id: 10 } })),
}));

import { useProofReceipt } from "../../../hooks/queries/useProofReceipt";
import { useAuth } from "../../../hooks/useAuth";
const mockUseProofReceipt = vi.mocked(useProofReceipt);
const mockUseAuth = vi.mocked(useAuth);

describe("ProofReceiptFeed", () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({
      userProfile: { organizationId: 1 },
    } as ReturnType<typeof useAuth>);
  });

  it("renders a dated row per published work item", () => {
    mockUseProofReceipt.mockReturnValue({
      receipt: {
        organizationId: 1,
        since: "2026-06-01",
        until: "2026-06-30",
        items: [
          { type: "review_reply", at: "2026-06-15T12:00:00.000Z", workItemId: "a", locationId: 10 },
          { type: "local_post", at: "2026-06-12T12:00:00.000Z", workItemId: "b", locationId: 10 },
        ],
        summary: { reviewReplies: 1, localPosts: 1, total: 2 },
      },
      isLoading: false,
      error: null,
    });

    render(<ProofReceiptFeed />);

    expect(screen.getByText("What Alloro did for you")).toBeInTheDocument();
    expect(screen.getByText("Review reply posted")).toBeInTheDocument();
    expect(screen.getByText("Local post published")).toBeInTheDocument();
    // Dates render as "MMM d" for older days.
    expect(screen.getByText("Jun 15")).toBeInTheDocument();
    expect(screen.getByText("Jun 12")).toBeInTheDocument();
  });

  it("labels a business_info item honestly", () => {
    mockUseProofReceipt.mockReturnValue({
      receipt: {
        organizationId: 1,
        since: "2026-06-01",
        until: "2026-06-30",
        items: [
          { type: "business_info", at: "2026-06-10T12:00:00.000Z", workItemId: "c", locationId: 10 },
        ],
        summary: { reviewReplies: 0, localPosts: 0, total: 1 },
      },
      isLoading: false,
      error: null,
    });

    render(<ProofReceiptFeed />);
    expect(screen.getByText("Business info updated")).toBeInTheDocument();
  });

  it("shows the honest empty state with the month when there is nothing yet", () => {
    mockUseProofReceipt.mockReturnValue({
      receipt: {
        organizationId: 1,
        since: "2026-06-01",
        until: "2026-06-30",
        items: [],
        summary: { reviewReplies: 0, localPosts: 0, total: 0 },
      },
      isLoading: false,
      error: null,
    });

    render(<ProofReceiptFeed />);
    expect(screen.getByText(/Nothing published yet in June 2026/)).toBeInTheDocument();
  });

  it("shows a 'most recent' footer when the total exceeds the page", () => {
    mockUseProofReceipt.mockReturnValue({
      receipt: {
        organizationId: 1,
        since: "2026-06-01",
        until: "2026-06-30",
        items: [
          { type: "local_post", at: "2026-06-15T12:00:00.000Z", workItemId: "a", locationId: 10 },
        ],
        summary: { reviewReplies: 0, localPosts: 1, total: 51 },
      },
      isLoading: false,
      error: null,
    });

    render(<ProofReceiptFeed />);
    expect(
      screen.getByText("Showing your 1 most recent · 51 in June 2026."),
    ).toBeInTheDocument();
  });

  it("renders nothing (never a false 'nothing published') when the receipt is unknown", () => {
    // receipt null but not loading and not error — an idle/disabled/coerced
    // state. Asserting emptiness here would be a fabricated negative (Value #6),
    // so the feed must render nothing at all.
    mockUseProofReceipt.mockReturnValue({
      receipt: null,
      isLoading: false,
      error: null,
    });

    const { container } = render(<ProofReceiptFeed />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(/Nothing published yet/)).toBeNull();
  });

  it("shows a loading skeleton while fetching", () => {
    mockUseProofReceipt.mockReturnValue({
      receipt: null,
      isLoading: true,
      error: null,
    });

    const { container } = render(<ProofReceiptFeed />);
    expect(screen.getByText("What Alloro did for you")).toBeInTheDocument();
    expect(container.querySelector(".animate-pulse")).toBeTruthy();
  });

  it("surfaces a quiet error state on fetch failure (never a blank crash)", () => {
    mockUseProofReceipt.mockReturnValue({
      receipt: null,
      isLoading: false,
      error: new Error("Network error"),
    });

    render(<ProofReceiptFeed />);
    expect(screen.getByText(/Couldn.t load your activity right now/)).toBeInTheDocument();
  });

  it("renders nothing when there is no organization context", () => {
    mockUseAuth.mockReturnValue({ userProfile: null } as ReturnType<typeof useAuth>);
    mockUseProofReceipt.mockReturnValue({
      receipt: null,
      isLoading: false,
      error: null,
    });

    const { container } = render(<ProofReceiptFeed />);
    expect(container).toBeEmptyDOMElement();
  });

});

// -----------------------------------------------------------------------------
// The receipt window (`since`) is typed non-optional and the backend always
// sets it, but the component formats it defensively. These pin what that
// defence must do: abstain from naming a month, never substitute the CLIENT's
// current month for a window the response never described.
// -----------------------------------------------------------------------------
describe("ProofReceiptFeed when a date is not readable", () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({
      userProfile: { organizationId: 1 },
    } as ReturnType<typeof useAuth>);
    // Freeze "now" in July so an accidental fallback to the client clock is
    // detectable, and the assertion does not drift with the calendar.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("marks a row whose timestamp is unreadable as 'Date unknown'", () => {
    mockUseProofReceipt.mockReturnValue({
      receipt: {
        organizationId: 1,
        since: "2026-06-01",
        until: "2026-06-30",
        items: [
          { type: "local_post", at: "garbage", workItemId: "a", locationId: 10 },
        ],
        summary: { reviewReplies: 0, localPosts: 1, total: 1 },
      },
      isLoading: false,
      error: null,
    });

    render(<ProofReceiptFeed />);
    // The card's whole promise is "dated". A row we cannot date says so out
    // loud rather than rendering undated and looking like every other row.
    expect(screen.getByText("Local post published")).toBeInTheDocument();
    expect(screen.getByText("Date unknown")).toBeInTheDocument();
  });

  it("does not name a month when the receipt window is missing", () => {
    mockUseProofReceipt.mockReturnValue({
      receipt: {
        organizationId: 1,
        until: "2026-06-30",
        items: [],
        summary: { reviewReplies: 0, localPosts: 0, total: 0 },
      } as unknown as ProofReceipt,
      isLoading: false,
      error: null,
    });

    render(<ProofReceiptFeed />);

    // FALSIFIER: fabricating the client's current month would render "July 2026".
    expect(screen.queryByText(/July|June/)).toBeNull();
    expect(screen.getByText(/Nothing published yet\./)).toBeInTheDocument();
    expect(screen.queryByText(/Nothing published yet in/)).toBeNull();
  });

  it("does not name a month when the receipt window is unparseable", () => {
    mockUseProofReceipt.mockReturnValue({
      receipt: {
        organizationId: 1,
        since: "not-a-date",
        until: "2026-06-30",
        items: [],
        summary: { reviewReplies: 0, localPosts: 0, total: 0 },
      },
      isLoading: false,
      error: null,
    });

    render(<ProofReceiptFeed />);

    expect(screen.queryByText(/July|June/)).toBeNull();
    expect(screen.getByText(/Nothing published yet\./)).toBeInTheDocument();
    // FALSIFIER: an empty month label used to render "Nothing published yet in ."
    expect(screen.queryByText(/yet in \./)).toBeNull();
  });

  it("drops the month from the footer rather than naming a window it does not have", () => {
    mockUseProofReceipt.mockReturnValue({
      receipt: {
        organizationId: 1,
        since: "not-a-date",
        until: "2026-06-30",
        items: [
          { type: "local_post", at: "2026-06-15T12:00:00.000Z", workItemId: "a", locationId: 10 },
        ],
        summary: { reviewReplies: 0, localPosts: 1, total: 51 },
      },
      isLoading: false,
      error: null,
    });

    render(<ProofReceiptFeed />);

    expect(screen.getByText("Showing your 1 most recent · 51 published.")).toBeInTheDocument();
    expect(screen.queryByText(/July|June/)).toBeNull();
  });
});
