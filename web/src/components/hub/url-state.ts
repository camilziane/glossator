/**
 * The Articles table's state in the URL, so a filtered view can be shared or reloaded:
 *
 *   /bib/?b=ml&q=attention&tag=Architecture&tag=Attention&tagmode=any&year=2015-2024&notice=serious&sort=cite.asc&cols=tags
 *
 * Defaults stay out of the URL. Several tags keep the articles having all of them (`tagmode=any`:
 * one of them). `cols` lists the columns whose visibility differs from the default
 * (a shown Tags column, a hidden Model column). The table shown is the hash (`#kinds`).
 */
import {
  createParser,
  debounce,
  defaultRateLimit,
  parseAsNativeArrayOf,
  parseAsString,
  parseAsStringLiteral,
} from "nuqs"

import { NOTICE_LEVELS } from "./model"

export interface SortParam {
  readonly id: string
  readonly desc: boolean
}

/** Newest first: the order the data comes in. */
export const DEFAULT_SORT: SortParam = { id: "year", desc: true }

/** `<column>.asc` or `<column>.desc`. */
export const parseAsSort = createParser<SortParam>({
  parse(value) {
    const m = /^([a-z0-9][a-z0-9~-]*)\.(asc|desc)$/.exec(value)
    return m ? { id: m[1]!, desc: m[2] === "desc" } : null
  },
  serialize: (sort) => `${sort.id}.${sort.desc ? "desc" : "asc"}`,
  eq: (a, b) => a.id === b.id && a.desc === b.desc,
})

export interface YearRange {
  readonly from: number | null
  readonly to: number | null
}

const YEAR = /^\d{1,4}$/

/** `2015-2024`, `2015-` (from 2015) or `-2024` (until 2024); reversed bounds are swapped. */
export const parseAsYearRange = createParser<YearRange>({
  parse(value) {
    const m = /^(\d{0,4})-(\d{0,4})$/.exec(value)
    if (!m) return YEAR.test(value) ? { from: Number(value), to: Number(value) } : null
    const from = m[1] ? Number(m[1]) : null
    const to = m[2] ? Number(m[2]) : null
    if (from === null && to === null) return null
    if (from !== null && to !== null && from > to) return { from: to, to: from }
    return { from, to }
  },
  serialize: (r) => `${r.from ?? ""}-${r.to ?? ""}`,
  eq: (a, b) => a.from === b.from && a.to === b.to,
})

export function inYearRange(year: number | null, range: YearRange | null): boolean {
  if (!range) return true
  if (year === null) return false
  return (range.from === null || year >= range.from) && (range.to === null || year <= range.to)
}

/** How several chosen tags combine: articles having all of them (the default), or any of them. */
export const TAG_MODES = ["all", "any"] as const
export type TagMode = (typeof TAG_MODES)[number]

export const articleTableParams = {
  q: parseAsString.withDefault(""),
  sort: parseAsSort.withDefault(DEFAULT_SORT),
  tag: parseAsNativeArrayOf(parseAsString),
  tagmode: parseAsStringLiteral(TAG_MODES).withDefault("all"),
  status: parseAsNativeArrayOf(parseAsString),
  notice: parseAsNativeArrayOf(parseAsStringLiteral(NOTICE_LEVELS)),
  year: parseAsYearRange,
  cols: parseAsNativeArrayOf(parseAsString),
}

/** Typing waits for a pause before writing the URL; clearing the box writes it at once. */
export function typingOptions(value: string) {
  return { limitUrlUpdates: value ? debounce(300) : defaultRateLimit }
}

/** Filters, sorting and columns change the view, not the place: they replace the history entry. */
export const ARTICLE_TABLE_OPTIONS = { history: "replace", scroll: false } as const

/** Whether a column shows, given its default and the columns the URL toggles. */
export function isColumnVisible(id: string, defaultHidden: boolean, toggled: readonly string[]) {
  return toggled.includes(id) ? defaultHidden : !defaultHidden
}
