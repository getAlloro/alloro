import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AlloroActivitySummary } from "./AlloroActivitySummary";

// Mock the hook so we control what data the component sees without needing
// a full QueryClient / provider stack — mirrors CogitatingLoader's approach.
vi.mock("../../../hooks/queries/useProofReceipt", () => ({
  useProofReceipt: vi.fn(),
}));

import { useProofReceipt } from "../../../hooks/queries/useProofReceipt";
const mockUseProofReceipt = vi.mocked(useProofReceipt);

describe("AlloroActivitySummary", () => {
  it("renders the activity line with review replies and posts", () => {
    mockUseProofReceipt.mockReturnValue({
      receipt: {
        organizationId: 1,
        since: "2026-06-01",
        until: "2026-06-30",
        items: [],
        summary: { reviewReplies: 5, localPosts: 3, total: 8 },
      },
      isLoading: false,
      error: null,
    });

    render(<AlloroActivitySummary orgId={1} locationId={null} />);

    expect(
      screen.getByText(
        "Recently, Alloro handled 5 review replies and 3 posts for you — done, no action needed.",
      ),
    ).toBeInTheDocument();
  });

  it("renders the fallback when receipt has zero counts", () => {
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

    render(<AlloroActivitySummary orgId={1} locationId={null} />);

    expect(
      screen.getByText(
        /No fires to put out right now/,
      ),
    ).toBeInTheDocument();
  });

  it("renders the fallback when receipt is null (fetch failed or empty)", () => {
    mockUseProofReceipt.mockReturnValue({
      receipt: null,
      isLoading: false,
      error: new Error("Network error"),
    });

    render(<AlloroActivitySummary orgId={1} locationId={null} />);

    expect(
      screen.getByText(
        /No fires to put out right now/,
      ),
    ).toBeInTheDocument();
  });

  it("shows a loading skeleton while fetching", () => {
    mockUseProofReceipt.mockReturnValue({
      receipt: null,
      isLoading: true,
      error: null,
    });

    const { container } = render(
      <AlloroActivitySummary orgId={1} locationId={null} />,
    );

    expect(screen.getByText("Alloro's on it.")).toBeInTheDocument();
    // The pulse skeleton div is present instead of the descriptive paragraph.
    expect(container.querySelector(".animate-pulse")).toBeTruthy();
    expect(screen.queryByText(/Recently, Alloro handled/)).toBeNull();
  });

  it("uses singular 'reply' for exactly 1 review reply", () => {
    mockUseProofReceipt.mockReturnValue({
      receipt: {
        organizationId: 1,
        since: "2026-06-01",
        until: "2026-06-30",
        items: [],
        summary: { reviewReplies: 1, localPosts: 0, total: 1 },
      },
      isLoading: false,
      error: null,
    });

    render(<AlloroActivitySummary orgId={1} locationId={null} />);

    expect(
      screen.getByText(
        "Recently, Alloro handled 1 review reply for you — done, no action needed.",
      ),
    ).toBeInTheDocument();
  });

  it("uses singular 'post' for exactly 1 local post", () => {
    mockUseProofReceipt.mockReturnValue({
      receipt: {
        organizationId: 1,
        since: "2026-06-01",
        until: "2026-06-30",
        items: [],
        summary: { reviewReplies: 0, localPosts: 1, total: 1 },
      },
      isLoading: false,
      error: null,
    });

    render(<AlloroActivitySummary orgId={1} locationId={null} />);

    expect(
      screen.getByText(
        "Recently, Alloro handled 1 post for you — done, no action needed.",
      ),
    ).toBeInTheDocument();
  });

  it("joins both parts with 'and' when both are present", () => {
    mockUseProofReceipt.mockReturnValue({
      receipt: {
        organizationId: 1,
        since: "2026-06-01",
        until: "2026-06-30",
        items: [],
        summary: { reviewReplies: 1, localPosts: 1, total: 2 },
      },
      isLoading: false,
      error: null,
    });

    render(<AlloroActivitySummary orgId={1} locationId={null} />);

    expect(
      screen.getByText(
        "Recently, Alloro handled 1 review reply and 1 post for you — done, no action needed.",
      ),
    ).toBeInTheDocument();
  });
});
