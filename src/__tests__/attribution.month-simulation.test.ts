import { describe, expect, it } from "vitest";
import {
  measureCtrAttribution,
  type AttributionVerdict,
  type DailyMetricPoint,
} from "../controllers/patient-journey/feature-utils/ctrAttributionMath";

/**
 * E2 "endures a month simulation" harness (spec T5, Layer 1) — Rev 3.
 *
 * ⚠️ THESE FIXTURES ARE SYNTHETIC — fabricated, deterministic series built from explicit
 * click/impression COUNTS. Passing them proves the VERDICT LOGIC'S SHAPE (correct rung, no
 * fabricated number, confound named, silent-at-thin-scale, and every hole two adversary
 * rounds found). It does NOT prove honesty at production scale — no threshold here has been
 * validated against real GSC data; the customer surface stays dark until it is (spec Done
 * blocker). The count-based standard error is exercised by the impression VOLUMES.
 */

const INTERVENTION = "2026-06-19";
const DATA_END = "2026-06-30";
const PRE_DAYS = 18;
const POST_DAYS = 10;
const TOTAL_DAYS = PRE_DAYS + POST_DAYS;
const IS_PRE = (i: number) => i < PRE_DAYS;

/** Build a consecutive daily series from explicit per-day impressions and clicks. */
function rawSeries(
  startDate: string,
  days: number,
  impressionsAt: (i: number) => number,
  clicksAt: (i: number) => number,
): DailyMetricPoint[] {
  const [y, m, d] = startDate.split("-").map(Number);
  const out: DailyMetricPoint[] = [];
  for (let i = 0; i < days; i += 1) {
    const dt = new Date(Date.UTC(y, m - 1, d + i));
    const date = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
    out.push({ date, impressions: impressionsAt(i), clicks: clicksAt(i) });
  }
  return out;
}

const constImpr = (n: number) => () => n;
const constClk = (n: number) => () => n;
const stepClk = (pre: number, post: number) => (i: number) => (IS_PRE(i) ? pre : post);

interface Scenario {
  id: string;
  label: string;
  treated: DailyMetricPoint[];
  control: DailyMetricPoint[];
  interventionDate?: string;
  dataEndDate?: string;
  expected: AttributionVerdict["rung"];
}

const SCENARIOS: Scenario[] = [
  {
    id: "S1_up_adequate_volume",
    label: "treated CTR clearly rises (5%→8%), untreated flat, adequate volume",
    treated: rawSeries("2026-06-01", TOTAL_DAYS, constImpr(2000), stepClk(100, 160)),
    control: rawSeries("2026-06-01", TOTAL_DAYS, constImpr(2000), constClk(100)),
    expected: "trending_up",
  },
  {
    id: "S2_flat",
    label: "treated and untreated both flat, adequate volume",
    treated: rawSeries("2026-06-01", TOTAL_DAYS, constImpr(2000), constClk(100)),
    control: rawSeries("2026-06-01", TOTAL_DAYS, constImpr(2000), constClk(100)),
    expected: "no_detectable_change",
  },
  {
    id: "S3_seasonal",
    label: "seasonal — treated AND untreated both rise together (DiD nets out)",
    treated: rawSeries("2026-06-01", TOTAL_DAYS, constImpr(2000), stepClk(100, 160)),
    control: rawSeries("2026-06-01", TOTAL_DAYS, constImpr(2000), stepClk(100, 160)),
    expected: "no_detectable_change",
  },
  {
    id: "S6_decline",
    label: "action taken but CTR falls (5%→3%), adequate volume",
    treated: rawSeries("2026-06-01", TOTAL_DAYS, constImpr(2000), stepClk(100, 60)),
    control: rawSeries("2026-06-01", TOTAL_DAYS, constImpr(2000), constClk(100)),
    expected: "trending_down",
  },
  {
    id: "S7_new_business",
    label: "new business — no baseline before the action",
    treated: rawSeries("2026-06-19", TOTAL_DAYS, constImpr(2000), constClk(100)),
    control: [],
    interventionDate: "2026-06-01",
    dataEndDate: "2026-07-08",
    expected: "not_enough_data",
  },
  {
    id: "F_real_scale_lucky_streak",
    label: "REAL SCALE (~30 views/day): a GENUINE post doubling (1→2 clicks/day) by chance",
    treated: rawSeries("2026-06-01", TOTAL_DAYS, constImpr(30), stepClk(1, 2)),
    control: rawSeries("2026-06-01", TOTAL_DAYS, constImpr(30), constClk(1)),
    expected: "not_enough_data",
  },
  {
    id: "F_zero_click_thin_post",
    label: "solid 3% baseline, then a 3-day thin post with 0 clicks (a 25%-likely chance run) — v2 fabricated 'down'",
    treated: rawSeries("2026-06-01", 21, (i) => (i < 18 ? 200 : 15), (i) => (i < 18 ? 6 : 0)),
    control: [],
    interventionDate: "2026-06-19",
    dataEndDate: "2026-06-23",
    expected: "not_enough_data",
  },
  {
    id: "F_all_zero_thin",
    label: "all-zero thin series — v2 claimed 'enough views to detect'",
    treated: rawSeries("2026-06-01", TOTAL_DAYS, constImpr(10), constClk(0)),
    control: [],
    expected: "not_enough_data",
  },
  {
    id: "F_decisive_decline_caught",
    label: "5% baseline collapses to ~0% post, decisive — v2 silenced it as 'too small'",
    treated: rawSeries("2026-06-01", TOTAL_DAYS, (i) => (IS_PRE(i) ? 40 : 30), (i) => (IS_PRE(i) ? 2 : 0)),
    control: [],
    expected: "trending_down",
  },
  {
    id: "F_high_volume_decline",
    label: "40% click decline at 1% base CTR, high volume",
    treated: rawSeries("2026-06-01", TOTAL_DAYS, constImpr(5000), stepClk(50, 30)),
    control: rawSeries("2026-06-01", TOTAL_DAYS, constImpr(5000), constClk(50)),
    expected: "trending_down",
  },
  {
    id: "F_scrawny_control_ignored",
    label: "big treated decline + a scrawny control — must NOT re-hide the decline",
    treated: rawSeries("2026-06-01", TOTAL_DAYS, constImpr(5000), stepClk(50, 30)),
    control: rawSeries("2026-06-01", TOTAL_DAYS, (i) => (IS_PRE(i) ? 17 : 31), constClk(1)),
    expected: "trending_down",
  },
  {
    id: "F_short_declining_baseline",
    label: "only 5 pre-days, declining — too short to verify a stable baseline",
    treated: rawSeries("2026-06-14", TOTAL_DAYS, constImpr(2000), (i) => (i < 5 ? 180 - i * 20 : 100)),
    control: [],
    interventionDate: "2026-06-19",
    dataEndDate: "2026-07-10",
    expected: "not_enough_data",
  },
  {
    id: "F_v_shaped_baseline",
    label: "V-shaped baseline (down then up), post continues up — halves would miss it",
    treated: rawSeries("2026-06-01", TOTAL_DAYS, constImpr(2000), (i) => {
      if (!IS_PRE(i)) return 160; // post ~8%
      if (i < 6) return 140; // 7%
      if (i < 12) return 60; // 3%
      return 140; // 7% — the recovery began before the action
    }),
    control: [],
    expected: "not_enough_data",
  },
  {
    id: "F_malformed_day_dropped",
    label: "one corrupt day (clicks>impressions) is dropped, not turned into a NaN verdict",
    treated: rawSeries("2026-06-01", TOTAL_DAYS, constImpr(2000), (i) => (i === 20 ? 999999 : 100)),
    control: rawSeries("2026-06-01", TOTAL_DAYS, constImpr(2000), constClk(100)),
    expected: "no_detectable_change",
  },
  {
    id: "F_thin_zero_click_higher_baseline",
    label: "5% baseline @25 views/day, 3-day 0-click post (a ~4% chance run) — v3 fabricated 'down'",
    treated: rawSeries("2026-06-01", 21, (i) => (i < 18 ? 25 : 20), (i) => (i < 18 ? (i % 4 === 0 ? 2 : 1) : 0)),
    control: [],
    interventionDate: "2026-06-19",
    dataEndDate: "2026-06-23",
    expected: "not_enough_data",
  },
  {
    id: "F_did_before_stationarity",
    label: "treated baseline already rising + a flat qualifying control — must abstain, not DiD-fabricate 'up'",
    treated: rawSeries("2026-06-01", TOTAL_DAYS, constImpr(2000), (i) => (IS_PRE(i) ? 60 + i * 5 : 155)),
    control: rawSeries("2026-06-01", TOTAL_DAYS, constImpr(2000), constClk(100)),
    expected: "not_enough_data",
  },
  {
    id: "F_control_side_event_treated_flat",
    label: "treated perfectly flat, control has its OWN event — must not invent a treated move",
    treated: rawSeries("2026-06-01", TOTAL_DAYS, constImpr(2000), constClk(100)),
    control: rawSeries("2026-06-01", TOTAL_DAYS, constImpr(2000), stepClk(100, 160)),
    expected: "no_detectable_change",
  },
  {
    id: "F_flat_qualifying_control_confirms_decline",
    label: "real decline + a flat control at 0.5x volume — control confirms, never buries it",
    treated: rawSeries("2026-06-01", TOTAL_DAYS, constImpr(5000), stepClk(50, 30)),
    control: rawSeries("2026-06-01", TOTAL_DAYS, constImpr(2500), (i) => (IS_PRE(i) ? 25 : 25)),
    expected: "trending_down",
  },
  {
    id: "F_underperform_not_a_direction",
    label: "treated rises +1.5pp but the site rose +3pp — a wash to credit, not a fabricated 'up'",
    treated: rawSeries("2026-06-01", TOTAL_DAYS, constImpr(2000), stepClk(100, 130)),
    control: rawSeries("2026-06-01", TOTAL_DAYS, constImpr(2000), stepClk(100, 160)),
    expected: "no_detectable_change",
  },
  {
    id: "F_beyond_noise_but_immaterial",
    label:
      "high volume, CTR 5.0%→5.5%: clears the noise band but not the materiality bar — a real wiggle is not a result",
    // The gap the materiality check exists to close. At 20k views/day the band is ~0.15pp,
    // so +0.5pp IS beyond noise — but materiality is 20% relative (1pp at this baseline), so
    // it must NOT become a directional verdict. Deleting the materiality condition from
    // treatedMoved flips this to trending_up; that regression is what this fixture pins.
    treated: rawSeries("2026-06-01", TOTAL_DAYS, constImpr(20000), stepClk(1000, 1100)),
    control: [],
    expected: "no_detectable_change",
  },
  {
    id: "F_bad_dates_abstain",
    label: "unreadable dataEndDate must abstain, never measure the wrong window",
    treated: rawSeries("2026-06-01", TOTAL_DAYS, constImpr(2000), constClk(100)),
    control: [],
    dataEndDate: "not-a-date",
    expected: "not_enough_data",
  },
  {
    id: "F_min_pre_days_boundary",
    label: "exactly 6 pre-days, clear rise — passes; would fail if the pre-day floor were raised",
    treated: rawSeries("2026-06-01", 10, constImpr(2000), (i) => (i < 6 ? 100 : 160)),
    control: [],
    interventionDate: "2026-06-07",
    dataEndDate: "2026-06-12",
    expected: "trending_up",
  },
];

function run(s: Scenario): AttributionVerdict {
  return measureCtrAttribution({
    treated: s.treated,
    control: s.control,
    interventionDate: s.interventionDate ?? INTERVENTION,
    dataEndDate: s.dataEndDate ?? DATA_END,
  });
}

describe("E2 attribution — month simulation, count-based Rev 3 (survives)", () => {
  for (const s of SCENARIOS) {
    it(`${s.id}: ${s.label} → ${s.expected}`, () => {
      expect(run(s).rung).toBe(s.expected);
    });
  }

  it("MUTATION GUARD: the real-scale lucky streak abstains — narrowing the band 3x would flip it to a lie", () => {
    // This fixture sits just inside the abstain region (|diff| < band): if BAND_Z (or the
    // materiality) were cut ~3x, it flips to trending_up. That makes the suite detect the
    // fabrication direction, which the v2 suite could not.
    const lucky = SCENARIOS.find((s) => s.id === "F_real_scale_lucky_streak")!;
    expect(run(lucky).rung).toBe("not_enough_data");
  });

  it("every verdict is a valid rung with no NaN leaking through (malformed input included)", () => {
    for (const s of SCENARIOS) {
      const v = run(s);
      expect(v.rung).toMatch(/^(not_enough_data|no_detectable_change|trending_up|trending_down)$/);
    }
  });

  it("never emits a promised causal number anywhere in the battery", () => {
    for (const s of SCENARIOS) {
      const v = run(s);
      expect(Object.keys(v).sort()).toEqual(["confound", "method", "reason", "rung"]);
      expect(JSON.stringify(v)).not.toMatch(/\d+(\.\d+)?\s*%/);
      expect(JSON.stringify(v)).not.toMatch(/caused|because of us|we increased|we improved/i);
    }
  });

  it("names the confound on a directional verdict, and only then", () => {
    for (const s of SCENARIOS) {
      const v = run(s);
      if (v.rung === "trending_up" || v.rung === "trending_down") {
        expect(v.confound).toBeTruthy();
      } else {
        expect(v.confound).toBeNull();
      }
    }
  });

  it("abstains on an UNSORTED rising baseline — the trend guard must not depend on row order", () => {
    // A strong rising pre-trend (honest verdict: abstain) delivered scrambled — interleaved so a
    // positional third-split would average the trend away. Sorting at entry must still catch it.
    const rising = rawSeries("2026-06-01", TOTAL_DAYS, constImpr(2000), (i) => (IS_PRE(i) ? 60 + i * 5 : 155));
    const scrambled: typeof rising = [];
    for (let bucket = 0; bucket < 3; bucket += 1) {
      for (let i = 0; i < rising.length; i += 1) if (i % 3 === bucket) scrambled.push(rising[i]);
    }
    const v = measureCtrAttribution({
      treated: scrambled,
      control: [],
      interventionDate: INTERVENTION,
      dataEndDate: DATA_END,
    });
    expect(v.rung).toBe("not_enough_data");
  });

  it("MUTATION GUARD: a real-but-immaterial move says so, and never becomes a direction", () => {
    // Pins REASON_IMMATERIAL, which had no coverage: the suite could not tell "moved
    // slightly" from "nothing beyond noise", so dropping the materiality bar went unnoticed.
    const v = measureCtrAttribution({
      treated: rawSeries("2026-06-01", TOTAL_DAYS, constImpr(20000), stepClk(1000, 1100)),
      control: [],
      interventionDate: INTERVENTION,
      dataEndDate: DATA_END,
    });
    expect(v.rung).toBe("no_detectable_change");
    expect(v.reason).toMatch(/moved slightly, but not by a meaningful amount/i);
    // It must NOT claim the move was inside noise — it wasn't; it was just too small to matter.
    expect(v.reason).not.toMatch(/none showed up beyond normal day-to-day noise/i);
  });

  it("states an HONEST reason when treated moved but underperformed the site (never 'moved no differently')", () => {
    const v = measureCtrAttribution({
      treated: rawSeries("2026-06-01", TOTAL_DAYS, constImpr(2000), stepClk(100, 130)),
      control: rawSeries("2026-06-01", TOTAL_DAYS, constImpr(2000), stepClk(100, 160)),
      interventionDate: INTERVENTION,
      dataEndDate: DATA_END,
    });
    expect(v.rung).toBe("no_detectable_change");
    expect(v.reason).toMatch(/rose, but by less than the wider site/i);
  });

  it("abstains on duplicate calendar dates — double-counted rows must not halve the band", () => {
    const clean = rawSeries("2026-06-01", TOTAL_DAYS, constImpr(2000), stepClk(100, 160));
    const doubled = [...clean, ...clean]; // every date twice (an ORDER-BY-less JOIN)
    const v = measureCtrAttribution({
      treated: doubled, control: [], interventionDate: INTERVENTION, dataEndDate: DATA_END,
    });
    expect(v.rung).toBe("not_enough_data");
    expect(v.reason).toMatch(/same day appears more than once/i);
  });

  it("abstains on an impossible date (2026-02-30) instead of silently rolling it over", () => {
    const v = measureCtrAttribution({
      treated: rawSeries("2026-06-01", TOTAL_DAYS, constImpr(2000), constClk(100)),
      control: [], interventionDate: INTERVENTION, dataEndDate: "2026-02-30",
    });
    expect(v.rung).toBe("not_enough_data");
  });

  it("names a real cushioning effect honestly (treated fell LESS than the site)", () => {
    const v = measureCtrAttribution({
      treated: rawSeries("2026-06-01", TOTAL_DAYS, constImpr(2000), stepClk(100, 80)), // 5%→4%
      control: rawSeries("2026-06-01", TOTAL_DAYS, constImpr(2000), stepClk(100, 50)), // 5%→2.5%
      interventionDate: INTERVENTION, dataEndDate: DATA_END,
    });
    expect(v.rung).toBe("no_detectable_change");
    expect(v.reason).toMatch(/cushioned/i);
    expect(v.reason).not.toMatch(/behind the wider site/i); // the old false string
  });

  it("states the confound truthfully when the control moved the OTHER way", () => {
    const v = measureCtrAttribution({
      treated: rawSeries("2026-06-01", TOTAL_DAYS, constImpr(2000), stepClk(100, 160)), // 5%→8%
      control: rawSeries("2026-06-01", TOTAL_DAYS, constImpr(2000), stepClk(100, 40)), // 5%→2%
      interventionDate: INTERVENTION, dataEndDate: DATA_END,
    });
    expect(v.rung).toBe("trending_up");
    expect(v.confound).toMatch(/moved the other way/i);
  });

  it("drops the unsettled trailing days — a spiking tail inside the lag window can't fake a move", () => {
    // Flat 5% baseline and settled post; the final 2 calendar days (inside the 2-day settling
    // window) spike to 20%. Dropped correctly → flat → no change. If the settling drop were
    // OFF, those 2 days would pull the post window over the materiality bar and fake a rise —
    // so this fixture genuinely pins UNSETTLED_TRAILING_DAYS downward.
    const treated = rawSeries("2026-06-01", 30, constImpr(2000), (i) => (i >= 28 ? 400 : 100));
    const v = measureCtrAttribution({
      treated, control: [], interventionDate: INTERVENTION, dataEndDate: "2026-06-30",
    });
    expect(v.rung).toBe("no_detectable_change");
  });

  it("on the DiD path, an immaterial NET move is described as net — never 'moved slightly' about a big raw jump", () => {
    // Treated jumps 5%→7% (a big RAW move), site rose almost as much, so the NET is immaterial.
    const v = measureCtrAttribution({
      treated: rawSeries("2026-06-01", TOTAL_DAYS, constImpr(50000), stepClk(2500, 3500)),
      control: rawSeries("2026-06-01", TOTAL_DAYS, constImpr(50000), stepClk(2500, 3400)),
      interventionDate: INTERVENTION, dataEndDate: DATA_END,
    });
    expect(v.rung).toBe("no_detectable_change");
    expect(v.reason).toMatch(/shared, site-wide shift is removed/i);
    expect(v.reason).not.toMatch(/^The treated pages moved slightly/i); // the ITS-only string
  });

  it("drops an impossible or malformed point-date row instead of counting it", () => {
    const clean = rawSeries("2026-06-01", TOTAL_DAYS, constImpr(2000), constClk(100));
    const poisoned = [...clean, { date: "2026-02-30", impressions: 2000, clicks: 2000 }];
    const v = measureCtrAttribution({
      treated: poisoned, control: [], interventionDate: INTERVENTION, dataEndDate: DATA_END,
    });
    // The 100%-CTR impossible-date row is dropped, so the flat 5% series still reads flat.
    expect(v.rung).toBe("no_detectable_change");
  });

  it("uses ITS (not DiD) when the control is too thin to trust", () => {
    const v = measureCtrAttribution({
      treated: rawSeries("2026-06-01", TOTAL_DAYS, constImpr(2000), stepClk(100, 160)),
      control: rawSeries("2026-06-01", TOTAL_DAYS, constImpr(12), constClk(1)),
      interventionDate: INTERVENTION,
      dataEndDate: DATA_END,
    });
    expect(v.rung).toBe("trending_up");
    expect(v.method).toBe("its");
  });
});
