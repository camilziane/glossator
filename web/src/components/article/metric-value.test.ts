import { describe, expect, it } from "vitest"

import { boldFigures, formatConfidence, splitConfidence } from "./metric-value"

describe("splitConfidence", () => {
  it.each([
    ["4.2% (95% CI 3.1, 5.6)", "4.2%", ["95", "3.1", "5.6"]],
    ["61.0% [95% CI 57.5, 64.4]", "61.0%", ["95", "57.5", "64.4"]],
    ["0.37 (99% CI: [0.21, 0.52])", "0.37", ["99", "0.21", "0.52"]],
    ["33.3% (99% CI: 28.0, 39.9%)", "33.3%", ["99", "28.0", "39.9%"]],
    ["12.5% (median; 99% CI [8.25, 19.75])", "12.5% (median)", ["99", "8.25", "19.75"]],
    ["7.75% (median; 99% CI [5.5 10.25])", "7.75% (median)", ["99", "5.5", "10.25"]],
    ["median 44.25% (95% CI [40.5%, 48.0%])", "median 44.25%", ["95", "40.5%", "48.0%"]],
    ["0.8% (95% CI 0.1% to 2.2%)", "0.8%", ["95", "0.1%", "2.2%"]],
    ["−1.5 dB (95% CI −2.5, −0.5)", "−1.5 dB", ["95", "−2.5", "−0.5"]],
  ])("splits the interval closing %s", (text, value, [level, low, high]) => {
    expect(splitConfidence(text)).toEqual({ value, ci: { level, low, high } })
  })

  it.each([
    // the interval is not at the end: the value stays whole
    "3.5% (95% CI 2.5% to 4.5%) at 21 mm per season; single days 2.0% to 5.0%",
    "18.5% (99% CI: 15.0, 22.0%) overall; first half 17.0%",
    // a value of several parts: the interval is one part's
    "P1 0.31 (95% CI [0.1, 0.5]); P2 1.5 (95% CI [0.5, 2.5])",
    "92.0% accuracy; error rate 0.6% (95% CI 0.0% to 1.5%)",
    // an interval without numbers, or nothing left once it is cut
    "not above chance (95% CI includes chance)",
    "(95% CI 1.0, 2.0)",
    // no interval at all
    "48 of 60",
    "0.42 ± 0.07",
    "",
  ])("leaves %j as written", (text) => {
    expect(splitConfidence(text)).toEqual({ value: text, ci: null })
  })

  it("writes the interval as a range", () => {
    expect(formatConfidence({ level: "95", low: "3.1", high: "5.6" })).toBe("3.1–5.6")
  })
})

describe("boldFigures", () => {
  const bold = (value: string) =>
    boldFigures(value)
      .map((p) => (typeof p === "string" ? p : `**${p.number}**`))
      .join("")

  it.each([
    ["4.2%", "**4.2%**"],
    ["median 44.25% across days", "median **44.25%** across days"],
    ["31% (P1), 12% (P2), 40% (P3)", "**31%** (P1), **12%** (P2), **40%** (P3)"],
    ["18% to 47% (P2, P3)", "**18%** to **47%** (P2, P3)"],
    ["0.25 events per 100 000 people", "**0.25** events per 100 000 people"],
    ["48 of 60", "**48** of 60"],
    ["0.42 ± 0.07", "**0.42 ± 0.07**"],
    ["71.25 ± 0.15%", "**71.25 ± 0.15%**"],
    ["P3 0.61 (block 2); P4 0.58", "P3 **0.61** (block 2); P4 0.58"],
    ["more than 2,140 h", "more than **2,140** h"],
    ["between −12 and +6 ms", "between **−12** and +6 ms"],
    ["7.5%.", "**7.5%**."],
    ["typically around 30–45%", "typically around **30–45%**"],
    ["P1 0.31 (95% CI [0.1, 0.5]); P2 1.5", "P1 **0.31** (95% CI [0.1, 0.5]); P2 1.5"],
    [
      "92.0% in all; rate 0.6% (95% CI 0.0% to 1.5%)",
      "**92.0%** in all; rate **0.6%** (95% CI 0.0% to 1.5%)",
    ],
  ])("sets the figures of %j in bold", (value, expected) => {
    expect(bold(value)).toBe(expected)
  })

  it("finds no number inside a word, nor in words alone", () => {
    expect(boldFigures("S4ND and S12")).toEqual(["S4ND and S12"])
    expect(boldFigures("1.8k core-hours")).toEqual(["1.8k core-hours"])
    expect(boldFigures("not reported")).toEqual(["not reported"])
  })
})
