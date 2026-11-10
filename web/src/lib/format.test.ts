import { describe, expect, it } from "vitest"

import {
  formatCount,
  formatDate,
  formatDateTime,
  formatNumber,
  formatRelative,
  formatShortDate,
  relativeDay,
  shortVenue,
} from "./format"

describe("format", () => {
  it("counts with the right noun", () => {
    expect(formatCount(1, "article")).toBe("1 article")
    expect(formatCount(1234, "article")).toBe("1,234 articles")
    expect(formatCount(2, "bibliography", "bibliographies")).toBe("2 bibliographies")
    expect(formatNumber(0.71)).toBe("0.71")
  })

  it("writes dates day first, partial ones as far as they go", () => {
    expect(formatDate("2023-08-23")).toBe("23 Aug 2023")
    expect(formatDate("2026-03-04")).toBe("4 Mar 2026")
    expect(formatDate("2026-09-30")).toBe("30 Sep 2026")
    expect(formatDate("2026-03")).toBe("Mar 2026")
    expect(formatDate("2026")).toBe("2026")
    expect(formatDate("")).toBe("")
    expect(formatDate("2026-13")).toBe("2026-13")
    expect(formatDate("2026-02-31x")).toBe("2026-02-31x")
    expect(formatDate("not a date")).toBe("not a date")
  })

  it("reads a date-time in the reader's time zone", () => {
    const local = new Date(2026, 10, 10, 7, 45)
    expect(formatDateTime(local.toISOString())).toBe("07:45, 10 Nov 2026")
    expect(formatDate(local.toISOString())).toBe("10 Nov 2026")
    expect(formatDateTime("nope")).toBe("nope")
  })

  it("drops this year from short dates", () => {
    const now = new Date(2026, 10, 10, 12)
    expect(formatShortDate("2026-11-01", now)).toBe("1 Nov")
    expect(formatShortDate("2025-11-01", now)).toBe("1 Nov 2025")
    expect(formatShortDate("2025-11", now)).toBe("Nov 2025")
  })

  it("names today and yesterday", () => {
    const now = new Date(2026, 10, 10, 0, 30)
    expect(relativeDay("2026-11-10", now)).toBe("today")
    expect(relativeDay("2026-11-09", now)).toBe("yesterday")
    expect(relativeDay("2026-11-08", now)).toBeNull()
    expect(relativeDay("2026-11-11", now)).toBeNull()
    expect(relativeDay("", now)).toBeNull()
  })

  it("says how long ago", () => {
    const now = new Date("2026-11-10T12:00:00Z")
    expect(formatRelative("2026-11-10T09:00:00Z", now)).toBe("3 hours ago")
    expect(formatRelative("2026-11-09T12:00:00Z", now)).toBe("yesterday")
    expect(formatRelative("2026-11-10T11:59:30Z", now)).toBe("just now")
    expect(formatRelative("not a date", now)).toBe("not a date")
  })
})

describe("shortVenue", () => {
  it.each([
    ["arXiv (Cornell University)", "arXiv"],
    ["bioRxiv (Cold Spring Harbor Laboratory)", "bioRxiv"],
    ["Zenodo (CERN European Organization for Nuclear Research)", "Zenodo"],
    ["bioRxiv : the preprint server for biology", "bioRxiv"],
    ["Annals of Invented Ecology (Springfield, Ill. : 1990)", "Annals of Invented Ecology"],
    ["Journal of Imaginary Ecology", "Journal of Imaginary Ecology"],
    ["Biomedical Physics & Engineering Express", "Biomedical Physics & Engineering Express"],
    ["Oikos: the journal of invented ecology", "Oikos"],
    [
      "Proceedings of Fictional Engineering: Systems",
      "Proceedings of Fictional Engineering: Systems",
    ],
    ["(Only a parenthesis)", "(Only a parenthesis)"],
    ["  arXiv  ", "arXiv"],
    ["", ""],
  ])("%j -> %j", (venue, short) => {
    expect(shortVenue(venue)).toBe(short)
  })
})
