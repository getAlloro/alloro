import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { MonthTabs } from "./MonthTabs";
import type { MonthBucket } from "../types";

// Regression guard for the "upload May → shows April" bug, at the COMPONENT
// level: the month tab must label a "2026-05" bucket as "May 2026" for a
// US-Eastern (negative-offset) user. Run under `TZ=America/New_York` this is a
// genuine timezone simulation; because the fix builds the label from a name
// array (never `new Date(key + "-01")`), the assertion also holds in any zone.
const mayBucket: MonthBucket = { id: 1, month: "2026-05", rows: [] };
const noop = () => {};

describe("MonthTabs month label — timezone simulation", () => {
  it("labels the 2026-05 bucket 'May 2026', never April", () => {
    render(
      <MonthTabs
        sortedMonths={[mayBucket]}
        months={[mayBucket]}
        activeMonthId={1}
        targetMonth="2026-05"
        confirmDeleteMonthId={null}
        setActiveMonthId={noop}
        requestDeleteMonth={noop}
        deleteMonth={noop}
        setConfirmDeleteMonthId={noop}
        addMonthBucket={noop}
      />
    );
    expect(screen.getByText("May 2026")).toBeInTheDocument();
    expect(screen.queryByText(/Apr/)).toBeNull();
  });

  it("control: the OLD new Date(key + '-01') pattern is what mislabeled May as April in US zones", () => {
    // Positive offset minutes = the host is BEHIND UTC (every US zone). This is
    // how we prove the running test process is actually simulating US-Eastern.
    const offsetMin = new Date("2026-05-01").getTimezoneOffset();
    const oldLabel = new Date("2026-05-01").toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    });
    if (offsetMin > 0) {
      expect(oldLabel).toBe("Apr 2026"); // US-Eastern: the bug reproduces
    } else {
      expect(oldLabel).toBe("May 2026"); // Manila/dev (UTC+8): bug invisible
    }
  });
});
