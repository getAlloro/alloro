import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  OwnerReceipt,
  OwnerReceiptWindows,
} from "../../../api/ownerReceipt";
import { ACTIONS_FILTER_EMPTY, ACTIONS_HEADING } from "./ownerReceiptCopy";
import { buildWindowPresets, isoDayLocal } from "./ownerReceiptControls";

/**
 * The card's control wiring — what the pure `ownerReceiptControls.ts` tests
 * cannot reach.
 *
 * The unit that actually broke in review was not the date arithmetic (which is
 * correct) but the CHOICE of anchor and the wiring around it: which windows the
 * hook is asked for, how many requests one intended query costs, and whether a
 * parent-driven window change reaches the fetch at all.
 */

const useOwnerReceiptMock = vi.fn();

/** Every distinct window pair the hook was asked for, in order. */
const windowsAsked: string[] = [];

vi.mock("../../../hooks/queries/useOwnerReceipt", () => ({
  useOwnerReceipt: (
    orgId: number | null,
    windows: OwnerReceiptWindows | null,
    locationId: number | null,
    options?: { enabled?: boolean },
  ) => {
    const key = JSON.stringify(windows);
    if (windowsAsked[windowsAsked.length - 1] !== key) windowsAsked.push(key);
    return useOwnerReceiptMock(orgId, windows, locationId, options);
  },
}));

const { OwnerReceiptCard } = await import("./OwnerReceiptCard");

const TODAY = isoDayLocal(new Date());
const PRESETS = buildWindowPresets(TODAY);
const PRESET_28 = PRESETS[0];
const PRESET_90 = PRESETS[1];

function receiptFixture(over: Partial<OwnerReceipt> = {}): OwnerReceipt {
  return {
    organizationId: 39,
    projectId: "p1",
    preWindow: {
      start: PRESET_28.windows.preStart,
      end: PRESET_28.windows.preEnd,
    },
    postWindow: {
      start: PRESET_28.windows.postStart,
      end: PRESET_28.windows.postEnd,
    },
    actions: {
      organizationId: 39,
      since: `${PRESET_28.windows.preStart}T00:00:00.000Z`,
      until: `${PRESET_28.windows.postEnd}T23:59:59.999Z`,
      items: [
        {
          type: "review_reply",
          at: "2026-06-02T12:00:00.000Z",
          workItemId: "wi-1",
          locationId: 1,
        },
        {
          type: "local_post",
          at: "2026-06-05T12:00:00.000Z",
          workItemId: "wi-2",
          locationId: 1,
        },
        {
          type: "local_post",
          at: "2026-06-09T12:00:00.000Z",
          workItemId: "wi-3",
          locationId: 1,
        },
      ],
      summary: { reviewReplies: 1, localPosts: 2, total: 3 },
      pagination: { page: 1, limit: 50, total: 3, totalPages: 1 },
    },
    metrics: [],
    impressionsTrend: {
      organizationId: 39,
      projectId: "p1",
      source: "gsc_organic",
      pre: null,
      post: null,
      delta: null,
      pctChange: null,
      sufficient: false,
      reason: "no stored GSC-organic history",
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

function loaded(over: Partial<OwnerReceipt> = {}) {
  return { receipt: receiptFixture(over), isLoading: false, error: null };
}

beforeEach(() => {
  useOwnerReceiptMock.mockReset();
  windowsAsked.length = 0;
});

describe("OwnerReceiptCard controls — picking a window", () => {
  it("asks the hook for the 90-day windows when the 90-day pill is clicked", () => {
    useOwnerReceiptMock.mockReturnValue(loaded());
    render(
      <OwnerReceiptCard
        orgId={39}
        locationId={null}
        windows={PRESET_28.windows}
      />,
    );

    const pill90 = screen.getByRole("button", { name: PRESET_90.shortLabel });
    expect(pill90).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(pill90);

    expect(pill90).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: PRESET_28.shortLabel }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(windowsAsked[windowsAsked.length - 1]).toBe(
      JSON.stringify(PRESET_90.windows),
    );
  });

  it("shows the preset's concrete dates, so '28 days' is not a black box", () => {
    useOwnerReceiptMock.mockReturnValue(loaded());
    render(
      <OwnerReceiptCard
        orgId={39}
        locationId={null}
        windows={PRESET_28.windows}
      />,
    );
    // The lag is stated rather than hidden.
    expect(screen.getByText(/stop a few days short of today/i)).toBeInTheDocument();
  });

  it("fires ONE request for a custom range, not one per keystroke", () => {
    useOwnerReceiptMock.mockReturnValue(loaded());
    render(
      <OwnerReceiptCard
        orgId={39}
        locationId={null}
        windows={PRESET_28.windows}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Custom" }));
    const askedBefore = windowsAsked.length;

    const from = screen.getByLabelText("From");
    // Every arrow-key step on a date input emits a valid intermediate value.
    fireEvent.change(from, { target: { value: "2020-01-01" } });
    fireEvent.change(from, { target: { value: "2024-01-01" } });
    fireEvent.change(from, { target: { value: "2026-01-01" } });

    // Nothing is asked for until the field is committed.
    expect(windowsAsked.length).toBe(askedBefore);

    fireEvent.blur(from);

    expect(windowsAsked.length).toBe(askedBefore + 1);
    expect(JSON.parse(windowsAsked[windowsAsked.length - 1]).postStart).toBe(
      "2026-01-01",
    );
  });

  it("keeps the last honest windows when the custom range is reversed", () => {
    useOwnerReceiptMock.mockReturnValue(loaded());
    render(
      <OwnerReceiptCard
        orgId={39}
        locationId={null}
        windows={PRESET_28.windows}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Custom" }));
    const askedBefore = windowsAsked.length;

    const from = screen.getByLabelText("From");
    fireEvent.change(from, { target: { value: "2030-01-01" } }); // after "To"
    fireEvent.blur(from);

    expect(windowsAsked.length).toBe(askedBefore);
  });

  it("reconciles a window change driven by the PARENT, not just by the owner", () => {
    useOwnerReceiptMock.mockReturnValue(loaded());
    const { rerender } = render(
      <OwnerReceiptCard
        orgId={39}
        locationId={null}
        windows={PRESET_28.windows}
      />,
    );
    expect(windowsAsked[windowsAsked.length - 1]).toBe(
      JSON.stringify(PRESET_28.windows),
    );

    rerender(
      <OwnerReceiptCard
        orgId={39}
        locationId={null}
        windows={PRESET_90.windows}
      />,
    );

    expect(windowsAsked[windowsAsked.length - 1]).toBe(
      JSON.stringify(PRESET_90.windows),
    );
  });

  it("keeps the controls reachable on the failure branch", () => {
    useOwnerReceiptMock.mockReturnValue({
      receipt: null,
      isLoading: false,
      error: Object.assign(new Error("denied"), { status: 403 }),
    });
    render(
      <OwnerReceiptCard
        orgId={39}
        locationId={null}
        windows={PRESET_28.windows}
      />,
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Compare" }),
    ).toBeInTheDocument();
  });
});

describe("OwnerReceiptCard controls — filtering what we did", () => {
  it("keeps the heading and the box when a filter matches nothing", () => {
    useOwnerReceiptMock.mockReturnValue(loaded());
    render(
      <OwnerReceiptCard
        orgId={39}
        locationId={null}
        windows={PRESET_28.windows}
      />,
    );

    const box = screen.getByLabelText("Filter what we did");
    fireEvent.change(box, { target: { value: "zzzz" } });

    expect(screen.getByText(ACTIONS_FILTER_EMPTY)).toBeInTheDocument();
    expect(screen.getByText(ACTIONS_HEADING)).toBeInTheDocument();
    expect(screen.getByLabelText("Filter what we did")).toBeInTheDocument();
  });

  it("states the search scope when the fetched page was capped", () => {
    const base = receiptFixture();
    useOwnerReceiptMock.mockReturnValue({
      receipt: {
        ...base,
        actions: {
          ...base.actions,
          summary: { reviewReplies: 40, localPosts: 80, total: 120 },
          pagination: { page: 1, limit: 50, total: 120, totalPages: 3 },
        },
      },
      isLoading: false,
      error: null,
    });
    render(
      <OwnerReceiptCard
        orgId={39}
        locationId={null}
        windows={PRESET_28.windows}
      />,
    );

    // Unfiltered, the cap itself is named.
    expect(screen.getByText(/Showing 3 of 120/)).toBeInTheDocument();

    // Filtered, the SCOPE of the search is named — the filter never saw rows
    // 4-120, and a search box over a hidden truncation is the cherry-pick this
    // control claims to disprove.
    fireEvent.change(screen.getByLabelText("Filter what we did"), {
      target: { value: "post" },
    });
    expect(screen.getByText(/Searched the 3 most recent of 120/)).toBeInTheDocument();
  });
});
