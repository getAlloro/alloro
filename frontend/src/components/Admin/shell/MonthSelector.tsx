import { useState, useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";

interface MonthSelectorProps {
  /** Current selected month in YYYY-MM format */
  value: string;
  /** Callback when month changes */
  onChange: (month: string) => void;
  /** Optional: Minimum selectable month in YYYY-MM format */
  minMonth?: string;
  /** Optional: Maximum selectable month in YYYY-MM format (defaults to current month) */
  maxMonth?: string;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const FULL_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * MonthSelector Component
 *
 * A month navigation component with:
 * - Left/Right arrows for month-by-month navigation
 * - Clickable label that opens a 12-month grid picker
 * - Year navigation in the grid view
 */
export function MonthSelector({
  value,
  onChange,
  minMonth,
  maxMonth: maxMonthProp,
}: MonthSelectorProps) {
  const [showGrid, setShowGrid] = useState(false);
  const [gridYear, setGridYear] = useState<number>(() => {
    const [year] = value.split("-").map(Number);
    return year;
  });
  const gridRef = useRef<HTMLDivElement>(null);

  // Parse current value
  const [currentYear, currentMonth] = value.split("-").map(Number);

  // Default max month to current month
  const now = new Date();
  const maxMonth =
    maxMonthProp ||
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // Parse min/max for comparison
  const [maxYear, maxMonthNum] = maxMonth.split("-").map(Number);
  const [minYear, minMonthNum] = minMonth
    ? minMonth.split("-").map(Number)
    : [2020, 1]; // Default min to 2020

  // Check if navigation is allowed
  const canGoNext = () => {
    if (currentYear < maxYear) return true;
    if (currentYear === maxYear && currentMonth < maxMonthNum) return true;
    return false;
  };

  const canGoPrev = () => {
    if (currentYear > minYear) return true;
    if (currentYear === minYear && currentMonth > minMonthNum) return true;
    return false;
  };

  // Navigate to previous month
  const handlePrevMonth = () => {
    if (!canGoPrev()) return;

    let newMonth = currentMonth - 1;
    let newYear = currentYear;

    if (newMonth < 1) {
      newMonth = 12;
      newYear -= 1;
    }

    onChange(`${newYear}-${String(newMonth).padStart(2, "0")}`);
  };

  // Navigate to next month
  const handleNextMonth = () => {
    if (!canGoNext()) return;

    let newMonth = currentMonth + 1;
    let newYear = currentYear;

    if (newMonth > 12) {
      newMonth = 1;
      newYear += 1;
    }

    onChange(`${newYear}-${String(newMonth).padStart(2, "0")}`);
  };

  // Handle month selection from grid
  const handleMonthSelect = (monthIndex: number) => {
    const newMonth = `${gridYear}-${String(monthIndex + 1).padStart(2, "0")}`;

    // Check bounds
    if (
      gridYear < minYear ||
      (gridYear === minYear && monthIndex + 1 < minMonthNum)
    ) {
      return;
    }
    if (
      gridYear > maxYear ||
      (gridYear === maxYear && monthIndex + 1 > maxMonthNum)
    ) {
      return;
    }

    onChange(newMonth);
    setShowGrid(false);
  };

  // Check if a month in the grid is selectable
  const isMonthSelectable = (monthIndex: number) => {
    if (
      gridYear < minYear ||
      (gridYear === minYear && monthIndex + 1 < minMonthNum)
    ) {
      return false;
    }
    if (
      gridYear > maxYear ||
      (gridYear === maxYear && monthIndex + 1 > maxMonthNum)
    ) {
      return false;
    }
    return true;
  };

  // Check if a month in the grid is currently selected
  const isMonthSelected = (monthIndex: number) => {
    return gridYear === currentYear && monthIndex + 1 === currentMonth;
  };

  // Navigate grid year
  const handlePrevYear = () => {
    if (gridYear > minYear) {
      setGridYear(gridYear - 1);
    }
  };

  const handleNextYear = () => {
    if (gridYear < maxYear) {
      setGridYear(gridYear + 1);
    }
  };

  // Close grid when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (gridRef.current && !gridRef.current.contains(event.target as Node)) {
        setShowGrid(false);
      }
    };

    if (showGrid) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showGrid]);

  // Reset grid year when opening
  useEffect(() => {
    if (showGrid) {
      setGridYear(currentYear);
    }
  }, [showGrid, currentYear]);

  // Format display text
  const displayText = `${FULL_MONTHS[currentMonth - 1]} ${currentYear}`;

  return (
    <div className="relative inline-flex items-center gap-1">
      {/* Previous Month Button */}
      <button
        onClick={handlePrevMonth}
        disabled={!canGoPrev()}
        className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-gray-500"
        title="Previous month"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>

      {/* Month/Year Label (Clickable) */}
      <button
        onClick={() => setShowGrid(!showGrid)}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-gray-700 font-medium hover:bg-gray-100 transition"
        title="Click to select month"
      >
        <Calendar className="w-4 h-4 text-gray-400" />
        <span>{displayText}</span>
      </button>

      {/* Next Month Button */}
      <button
        onClick={handleNextMonth}
        disabled={!canGoNext()}
        className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-gray-500"
        title="Next month"
      >
        <ChevronRight className="w-5 h-5" />
      </button>

      {/* Month Grid Picker */}
      {showGrid && (
        <div
          ref={gridRef}
          className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 bg-white rounded-xl border border-gray-200 shadow-lg p-4 min-w-[280px]"
        >
          {/* Year Navigation */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={handlePrevYear}
              disabled={gridYear <= minYear}
              className="p-1 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-lg font-semibold text-gray-800">
              {gridYear}
            </span>
            <button
              onClick={handleNextYear}
              disabled={gridYear >= maxYear}
              className="p-1 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Month Grid */}
          <div className="grid grid-cols-4 gap-2">
            {MONTHS.map((month, index) => {
              const selectable = isMonthSelectable(index);
              const selected = isMonthSelected(index);

              return (
                <button
                  key={month}
                  onClick={() => handleMonthSelect(index)}
                  disabled={!selectable}
                  className={`
                    px-3 py-2 rounded-lg text-sm font-medium transition
                    ${
                      selected
                        ? "bg-blue-600 text-white"
                        : selectable
                        ? "text-gray-700 hover:bg-gray-100"
                        : "text-gray-300 cursor-not-allowed"
                    }
                  `}
                >
                  {month}
                </button>
              );
            })}
          </div>

          {/* Quick Actions */}
          <div className="mt-4 pt-3 border-t border-gray-100 flex justify-center">
            <button
              onClick={() => {
                const currentMonthStr = `${now.getFullYear()}-${String(
                  now.getMonth() + 1
                ).padStart(2, "0")}`;
                onChange(currentMonthStr);
                setShowGrid(false);
              }}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Go to Current Month
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
