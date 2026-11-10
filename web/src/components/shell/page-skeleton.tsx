import type { CSSProperties, ReactNode } from "react"

import { cn } from "@/lib/utils"

import {
  TODAY_COUNT,
  TODAY_GRID,
  TODAY_PAGE_WIDTH,
  TODAY_ROW,
  TODAY_TEXT,
} from "@/components/overview/today-grid"

import { glossGrid, Page, PAGE_GUTTERS, type PageWidth } from "./page"

/**
 * What a page shows while the library loads (and what the static export holds): the page's own grid
 * in rules and text lines (no shimmer, no text, never an id where a name will be), shown only if
 * loading lasts (after 200 ms, a 150 ms fade), so nothing jumps when the data arrives.
 */
export type PageSkeletonVariant = "today" | "hub" | "article" | "search" | "inbox"

/** Each page's grid (the two grids: `full` and `glossed`, shell/page). */
const WIDTH: Record<Exclude<PageSkeletonVariant, "inbox">, PageWidth> = {
  today: TODAY_PAGE_WIDTH,
  hub: "full",
  article: "glossed",
  search: "full",
}

/**
 * A line of text: a wash bar about the height of the type's x-height, centred in its line box.
 * `size` is the type's line height and bar height in px.
 */
const TYPE = {
  display: [38, 22],
  title: [28, 15],
  lede: [29, 12],
  read: [27, 10],
  /** A title in a list (15.5/21). */
  item: [21, 11],
  /** A serif note: a scope, a gloss, a reason (15/22). */
  note: [22, 10],
  /** The inbox's triage summary (16.5/25). */
  summary: [25, 10],
  ui: [20, 9],
  small: [17, 8],
  label: [18, 8],
} as const

type Type = keyof typeof TYPE

function Line({ type, width, className }: { type: Type; width: string; className?: string }) {
  const [line, bar] = TYPE[type]
  return (
    <div className={cn("flex items-center", className)} style={{ height: line } as CSSProperties}>
      <div className="rounded-[2px] bg-muted" style={{ height: bar, width }} />
    </div>
  )
}

/** Several lines of a paragraph: full lines, the last one shorter. */
function Paragraph({ type, lines, last = "62%" }: { type: Type; lines: number; last?: string }) {
  return (
    <div>
      {Array.from({ length: lines }, (_, i) => (
        <Line key={i} type={type} width={i === lines - 1 ? last : i % 3 === 1 ? "96%" : "100%"} />
      ))}
    </div>
  )
}

const ROW_WIDTHS = [
  "82%",
  "64%",
  "74%",
  "90%",
  "58%",
  "70%",
  "86%",
  "66%",
  "78%",
  "60%",
  "72%",
  "84%",
]

function width(i: number): string {
  return ROW_WIDTHS[i % ROW_WIDTHS.length]!
}

// ---------------------------------------------------------------------------- the pages

/**
 * Today: the page's own frame (the glossed grid's width, `TODAY_GRID`: the hang, the measure, the
 * counts), the opening sentence, the inbox's heading, rows and Start triage (a quiet outline), the
 * bibliographies as a contents page (no head row) and the recent articles.
 */
function Today() {
  return (
    <div className={TODAY_GRID}>
      <div className={TODAY_TEXT}>
        <Paragraph type="lede" lines={2} last="72%" />
      </div>
      <div className={cn(TODAY_ROW, "mt-12")}>
        <Line type="read" width="7rem" className={cn(TODAY_TEXT, "mb-1")} />
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className={TODAY_ROW}>
            <div className={cn(TODAY_TEXT, "min-w-0 py-2")}>
              <Line type="item" width="100%" />
              <Line type="item" width={width(i)} />
              <Line type="small" width="46%" className="mt-0.5" />
            </div>
          </div>
        ))}
        <div className={cn(TODAY_TEXT, "mt-4 h-8 w-28 rounded-[4px] border border-border")} />
      </div>
      <div className={cn(TODAY_ROW, "mt-12")}>
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className={cn(TODAY_ROW, i === 0 ? "" : "mt-7")}>
            <Line type="title" width={["14rem", "11rem", "12rem"][i]!} className={TODAY_TEXT} />
            <Line type="read" width="1.5rem" className={TODAY_COUNT} />
            <div className={cn(TODAY_TEXT, "mt-1")}>
              <Paragraph type="note" lines={3} last="54%" />
            </div>
            <Line type="small" width="9rem" className={cn(TODAY_TEXT, "mt-1.5")} />
          </div>
        ))}
      </div>
    </div>
  )
}

/** A hub: the title line, the scope, the tabs, the toolbar and the table (two lines a row). */
function Hub() {
  return (
    <div>
      <div className="mb-2 flex items-center gap-4">
        <Line type="title" width="18rem" />
        <Line type="ui" width="8rem" />
      </div>
      <div className="mb-6 max-w-[34rem]">
        <Line type="read" width="92%" />
      </div>
      <div className="mb-4 flex gap-6 border-b border-border pb-2">
        {["4rem", "6rem", "7rem", "3.5rem"].map((w) => (
          <Line key={w} type="ui" width={w} />
        ))}
      </div>
      <div className="mb-5 flex flex-wrap items-center gap-4">
        <div className="h-8 w-64 rounded-[4px] border border-border" />
        {["3rem", "3rem", "5rem", "4rem", "3rem"].map((w, i) => (
          <Line key={i} type="ui" width={w} />
        ))}
      </div>
      <div className="overflow-hidden">
        <div className="flex gap-6 border-b border-border pb-1.5">
          <Line type="label" width="5rem" className="w-[22rem] shrink-0" />
          {["4rem", "6rem", "5rem", "7rem"].map((w, i) => (
            <Line key={i} type="label" width={w} className="hidden flex-1 md:flex" />
          ))}
        </div>
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className="flex gap-6 border-b border-border py-2.5">
            <div className="w-[22rem] max-w-full shrink-0">
              <Line type="item" width={width(i)} />
              <Line type="small" width="46%" />
            </div>
            {[0, 1, 2, 3].map((c) => (
              <div key={c} className="hidden flex-1 md:block">
                <Line type="ui" width={width(i + c + 3)} />
                {c === 1 ? <Line type="ui" width="40%" /> : null}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

/** An article: the glossed grid, its header beside the facts margin, the lede, a first section. */
function Article() {
  return (
    <div className={cn(glossGrid, "gap-y-10")}>
      <div className="hidden xl:block" />
      <div className="min-w-0 space-y-2">
        <Line type="label" width="10rem" />
        <Line type="small" width="70%" />
        <div className="pt-1">
          <Line type="display" width="100%" />
          <Line type="display" width="74%" />
        </div>
        <Line type="small" width="82%" />
        <Line type="small" width="40%" />
      </div>
      <div className="hidden space-y-3 border-t border-border pt-4 lg:block">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i}>
            <Line type="label" width="5rem" />
            <Line type="small" width={width(i + 2)} />
          </div>
        ))}
      </div>
      <div className="hidden xl:block" />
      <div className="min-w-0">
        <Paragraph type="lede" lines={4} last="40%" />
      </div>
      <div className="hidden lg:block" />
      <div className="hidden pt-1.5 xl:block">
        <Line type="read" width="6rem" />
      </div>
      <div className="min-w-0 space-y-5">
        <Paragraph type="read" lines={6} last="72%" />
        <Paragraph type="read" lines={4} last="38%" />
      </div>
      <div className="hidden space-y-2 lg:block">
        <Paragraph type="small" lines={4} last="56%" />
        <Line type="small" width="5rem" />
      </div>
    </div>
  )
}

/** The search: the field, the sentence of filters, results (40 %) and the reader (60 %). */
function Search() {
  return (
    <div>
      <div className="mb-3 h-11 w-full rounded-[4px] border border-border" />
      <Line type="ui" width="22rem" className="mb-6 max-w-full" />
      <div className="grid gap-10 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="space-y-6">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="space-y-1 border-b border-border pb-4">
              <Line type="item" width={width(i)} />
              <Line type="small" width="40%" />
              <div className="pt-1.5">
                <Paragraph type="small" lines={2} last="70%" />
              </div>
            </div>
          ))}
        </div>
        <div className="hidden space-y-2 xl:block">
          <Line type="title" width="60%" />
          <Line type="small" width="34%" />
          <div className="max-w-[34rem] pt-3">
            <Paragraph type="read" lines={9} last="45%" />
          </div>
        </div>
      </div>
    </div>
  )
}

/** The inbox's paper rows: a group label, then rows of two title lines and a meta line. */
function InboxRows({ rows }: { rows: number }) {
  return (
    <div>
      <Line type="label" width="6rem" className="pt-3 pb-1.5 pl-2.5" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex gap-2.5 border-b border-border py-2 pl-2.5">
          <div className="w-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <Line type="item" width="100%" />
            <Line type="item" width={width(i)} />
            <Line type="small" width="62%" />
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * The inbox, in its own frame (not the `Page`): narrower than 1024 px the page's column with the
 * views row and the list; from 1024 px a window-tall frame, the window's width at the page gutters
 * (the `full` grid), the views (with the
 * filters beside them from 1280 px, under them before), then the list column (34 %, 20–30 rem)
 * beside the reading pane (a hairline on its left, the gloss margin from a 760 px pane).
 */
function InboxSkeleton() {
  return (
    <div
      className={cn(
        "w-full pt-8 pb-16 lg:flex lg:h-[calc(100dvh-var(--header-height))] lg:flex-col lg:pt-5 lg:pb-0",
        PAGE_GUTTERS
      )}
    >
      <div className="flex shrink-0 flex-col xl:flex-row xl:items-center xl:justify-between xl:border-b xl:border-border">
        <div className="flex h-11 items-center gap-x-6 border-b border-border xl:border-b-0">
          {["3rem", "5.5rem", "5.5rem", "4.5rem"].map((w, i) => (
            <Line key={i} type="ui" width={w} className={i > 0 ? "max-md:hidden" : undefined} />
          ))}
          <div className="ml-auto h-8 w-32 rounded-[4px] border border-border md:hidden" />
        </div>
        <div className="hidden h-10 items-center gap-x-5 border-b border-border pl-2 md:flex xl:border-b-0 xl:pl-0">
          {["5rem", "2.5rem", "3.5rem", "7rem", "6rem", "3rem"].map((w, i) => (
            <Line key={i} type="ui" width={w} />
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 lg:grid lg:grid-cols-[clamp(20rem,34%,30rem)_minmax(0,1fr)]">
        <div className="min-w-0 overflow-hidden lg:pr-4">
          <InboxRows rows={10} />
        </div>
        <div className="@container hidden min-w-0 overflow-hidden border-l border-border pt-5 pl-8 lg:block">
          <div className="max-w-[48rem]">
            <Line type="title" width="88%" />
            <Line type="title" width="46%" />
            <Line type="small" width="52%" className="mt-1.5" />
            <Line type="small" width="9rem" className="mt-1" />
          </div>
          <div className="mt-5 grid grid-cols-1 gap-x-8 @min-[47.5rem]:grid-cols-[minmax(0,32rem)_minmax(12.5rem,18rem)]">
            <Paragraph type="summary" lines={6} last="52%" />
            <div className="mt-5 space-y-2 border-l border-border pl-4 @min-[47.5rem]:mt-0.5">
              <Paragraph type="note" lines={2} last="64%" />
              <Line type="small" width="70%" />
              <Line type="small" width="50%" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const VARIANTS: Record<PageSkeletonVariant, () => ReactNode> = {
  today: Today,
  hub: Hub,
  article: Article,
  search: Search,
  inbox: InboxSkeleton,
}

export function PageSkeleton({ variant }: { variant: PageSkeletonVariant }) {
  const Body = VARIANTS[variant]
  const skeleton = (
    <div role="status" aria-live="polite" aria-busy="true" className="animate-skeleton-in">
      <span className="sr-only">Loading the library…</span>
      <div aria-hidden>
        <Body />
      </div>
    </div>
  )
  // The inbox draws its own frame (wider than a page, as tall as the window).
  return variant === "inbox" ? skeleton : <Page width={WIDTH[variant]}>{skeleton}</Page>
}
