import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  OwnerReceipt,
  OwnerReceiptActionItem,
  OwnerReceiptWindows,
} from "../../../api/ownerReceipt";

/**
 * The card's own honesty contract — the parts the pure helpers cannot prove.
 *
 * Three of them are statements the CARD makes about system state rather than
 * about a number: that a failed request is a failure and not a data lag, that
 * the dated action list is labelled with the span it was actually read over,
 * and that a capped list says it is capped. Each is asserted against a real
 * render with the data-fetching hook mocked.
 */

const useOwnerReceiptMock = vi.fn();

vi.mock("../../../hooks/queries/useOwnerReceipt", () => ({
  useOwnerReceipt: (...args: unknown[]) => useOwnerReceiptMock(...args),
}));

const { OwnerReceiptCard } = await import("./OwnerReceiptCard");

const WINDOWS: OwnerReceiptWindows = {
  preStart: "2026-05-30",
  preEnd: "2026-06-26",
  postStart: "2026-06-27",
  postEnd: "2026-07-24",
};

function actionItem(index: number): OwnerReceiptActionItem {
  return {
    type: index % 2 === 0 ? "review_reply" : "local_post",
    at: `2026-06-${String((index % 28) + 1).padStart(2, "0")}T12:00:00.000Z`,
    workItemId: `wi-${index}`,
    locationId: 1,
  };
}

function receiptFixture(over: Partial<OwnerReceipt> = {}): OwnerReceipt {
  return {
    organizationId: 39,
    projectId: "p1",
    preWindow: { start: WINDOWS.preStart, end: WINDOWS.preEnd },
    postWindow: { start: WINDOWS.postStart, end: WINDOWS.postEnd },
    actions: {
      organizationId: 39,
      // The backend reads actions over [preWindow.start, postWindow.end] — a
      // wider span than the post window the header numbers describe.
      since: "2026-05-30T00:00:00.000Z",
      until: "2026-07-24T23:59:59.999Z",
      items: [actionItem(0), actionItem(1)],
      summary: { reviewReplies: 1, localPosts: 1, total: 2 },
      pagination: { page: 1, limit: 50, total: 2, totalPages: 1 },
    },
    metrics: [
      {
        gate: "leads",
        value: 0,
        source: "form_submissions",
        asOf: "2026-07-24",
        note: null,
      },
    ],
    impressionsTrend: {
      organizationId: 39,
      projectId: "p1",
      source: "gsc_organic",
      pre: null,
      post: null,
      delta: null,
      pctChange: null,
      sufficient: false,
      reason: "PRE window has no stored GSC-organic history",
      history: { earliest: null, latest: null },
    },
    diagnosis: {
      leadsPre: null,
      leadsPost: null,
      leadsChange: null,
      leadsChangeFactor: null,
      primaryDriver: null,
      terms: [],
      diagnosable: false,
      reason: "cannot decompose which term moved leads",
    },
    ...over,
  };
}

function renderCard() {
  return render(
    <OwnerReceiptCard orgId={39} locationId={null} windows={WINDOWS} />,
  );
}

beforeEach(() => {
  useOwnerReceiptMock.mockReset();
});

describe("OwnerReceiptCard — a failed request is not a data lag", () => {
  it("renders a failure state on a 403, never the not-ready copy", () => {
    useOwnerReceiptMock.mockReturnValue({
      receipt: null,
      isLoading: false,
      error: Object.assign(new Error("denied"), { status: 403 }),
    });

    renderCard();

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(
      screen.queryByText(/as soon as the data\s+is in/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/isn't ready yet/i)).not.toBeInTheDocument();
  });

  it("renders a failure state on a 404 (endpoint not deployed)", () => {
    useOwnerReceiptMock.mockReturnValue({
      receipt: null,
      isLoading: false,
      error: Object.assign(new Error("not found"), { code: "HTTP_404" }),
    });

    renderCard();

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(
      screen.queryByText(/as soon as the data\s+is in/i),
    ).not.toBeInTheDocument();
  });

  it("still renders the not-ready copy when the request SUCCEEDED with nothing in it", () => {
    useOwnerReceiptMock.mockReturnValue({
      receipt: null,
      isLoading: false,
      error: null,
    });

    renderCard();

    expect(screen.getByText(/isn't ready yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("OwnerReceiptCard — the numbers and the work are dated honestly", () => {
  it("labels the action list with the span it was read over, not the post window", () => {
    useOwnerReceiptMock.mockReturnValue({
      receipt: receiptFixture(),
      isLoading: false,
      error: null,
    });

    renderCard();

    // The header labels the NUMBERS with the post window…
    expect(screen.getByText("Jun 27, 2026 – Jul 24, 2026")).toBeInTheDocument();
    // …and the action list is labelled with its own, wider span.
    expect(screen.getByText("May 30, 2026 – Jul 24, 2026")).toBeInTheDocument();
  });

  it("states the cap when the backend truncated the action list", () => {
    const items = Array.from({ length: 50 }, (_, i) => actionItem(i));
    useOwnerReceiptMock.mockReturnValue({
      receipt: receiptFixture({
        actions: {
          organizationId: 39,
          since: "2026-05-30T00:00:00.000Z",
          until: "2026-07-24T23:59:59.999Z",
          items,
          summary: { reviewReplies: 25, localPosts: 95, total: 120 },
          pagination: { page: 1, limit: 50, total: 120, totalPages: 3 },
        },
      }),
      isLoading: false,
      error: null,
    });

    renderCard();

    expect(screen.getByText(/50 of 120/)).toBeInTheDocument();
  });

  it("does not claim a cap when the list is complete", () => {
    useOwnerReceiptMock.mockReturnValue({
      receipt: receiptFixture(),
      isLoading: false,
      error: null,
    });

    renderCard();

    expect(screen.queryByText(/Showing \d+ of/)).not.toBeInTheDocument();
  });

  it("renders a genuine 0 as '0', in the measured colour, with its source", () => {
    useOwnerReceiptMock.mockReturnValue({
      receipt: receiptFixture(),
      isLoading: false,
      error: null,
    });

    renderCard();

    const zero = screen.getByText("0");
    expect(zero).toBeInTheDocument();
    expect(zero.className).not.toContain("text-ink-muted");
    expect(screen.getByText(/From your website forms/)).toBeInTheDocument();
    expect(screen.queryByText("not measured")).not.toBeInTheDocument();
  });
});
