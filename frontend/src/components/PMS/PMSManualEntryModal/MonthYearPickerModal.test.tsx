import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { MonthYearPickerModal } from "./MonthYearPickerModal";
import type { MonthBucket } from "../types";

// T3 guard: the month-picker tile a US-Eastern user READS as "May" must commit
// the value "05". Pre-fix, the tile labeled "May" was the m="06" cell (June),
// so a US user picking May silently selected the wrong month. Run under
// `TZ=America/New_York` this is a real timezone simulation.
const activeMonth: MonthBucket = { id: 1, month: "2026-05", rows: [] };

describe("MonthYearPickerModal — tile label matches committed value", () => {
  it("the tile labeled 'May' commits month '05'", () => {
    const setTempMonth = vi.fn();
    render(
      <MonthYearPickerModal
        showMonthPicker
        activeMonth={activeMonth}
        setShowMonthPicker={() => {}}
        pickerStep="month"
        setPickerStep={() => {}}
        tempMonth={null}
        setTempMonth={setTempMonth}
        commitMonthChange={() => {}}
      />
    );
    fireEvent.click(screen.getByText("May"));
    expect(setTempMonth).toHaveBeenCalledWith("05");
  });
});
