"use client"

import { createContext, useContext } from "react"

import { type RowLines } from "./use-row-lines"

/** How many lines each cell shows: the table's choice, "full" inside a cell's popover. */
export const RowLinesContext = createContext<RowLines>("2")

export function useLines(): RowLines {
  return useContext(RowLinesContext)
}

export interface HubLinks {
  /** The bibliography shown. */
  bib: string
  /** The list the hub's article links come from (`from`): their pager and Esc lead back here. */
  from: string | null
  /** The tags of the bibliography: a second table's entry that is one filters the Articles. */
  tags: ReadonlySet<string>
  /** The Articles table filtered by one tag (a link). */
  tagHref: (tag: string) => string
}

export const HubLinksContext = createContext<HubLinks>({
  bib: "",
  from: null,
  tags: new Set(),
  tagHref: () => "",
})

export function useHubLinks(): HubLinks {
  return useContext(HubLinksContext)
}
