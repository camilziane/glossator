"use client"

import {
  defaultRangeExtractor,
  useVirtualizer,
  useWindowVirtualizer,
  type Range,
  type Virtualizer,
} from "@tanstack/react-virtual"
import { ChevronRightIcon } from "lucide-react"
import {
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type Ref,
  type RefObject,
} from "react"

import { formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"

import type { FailedDecision } from "./decide"
import type { InboxRow, RowGroup } from "./inbox-model"
import { Count } from "./paper-parts"
import { PaperRow, type PaperHandlers } from "./paper-row"

/** The list's feed (its papers in the view); the decided ones have a feed of their own. */
export const LIST_ID = "inbox-papers"
export const DECIDED_ID = "inbox-decided"

/** Beyond this many entries only those near the viewport are drawn (and the current one). */
export const VIRTUALIZE_AFTER = 40

export interface PaperListHandle {
  /** Bring a paper's row into the drawn range (it then mounts and registers). */
  scrollToPaper: (id: string, align: "auto" | "center") => void
}

/** What every row shares, from the page. */
export interface RowContext {
  active: string | null
  selected: ReadonlySet<string>
  selecting: boolean
  compact: boolean
  opens: boolean
  showFound: boolean
  handlers: PaperHandlers
  /** Papers whose decision was not saved (their rows say so). */
  failures: ReadonlyMap<string, FailedDecision>
  /** Select every paper of a group (its heading's "Select n"). */
  onSelectGroup?: (group: string) => void
}

/**
 * One line of the drawn list: a group's heading (collapsed with its last row), or a paper
 * (collapsed when decided).
 */
type Entry =
  | { kind: "header"; key: string; group: string; label: string; count: number; collapsed: boolean }
  | { kind: "row"; key: string; row: InboxRow; collapsed: boolean; position: number }

function entriesOf(groups: readonly RowGroup[], linked: InboxRow | null, linkedLabel: string) {
  const entries: Entry[] = []
  let position = 0
  if (linked) {
    entries.push({
      kind: "header",
      key: "h-linked",
      group: "linked",
      label: linkedLabel,
      count: 1,
      collapsed: false,
    })
    entries.push({
      kind: "row",
      key: linked.paper.id,
      row: linked,
      collapsed: false,
      position: ++position,
    })
  }
  for (const g of groups) {
    // A group whose papers were all decided keeps its heading, collapsed like its rows.
    if (g.label !== null)
      entries.push({
        kind: "header",
        key: `h-${g.key}`,
        group: g.key,
        label: g.label,
        count: g.count,
        collapsed: g.count === 0,
      })
    for (const r of g.rows)
      entries.push({
        kind: "row",
        key: r.row.paper.id,
        row: r.row,
        collapsed: r.collapsed,
        position: r.collapsed ? 0 : ++position,
      })
  }
  return { entries, total: position }
}

export interface PaperListProps extends RowContext {
  groups: readonly RowGroup[]
  linked: InboxRow | null
  linkedLabel: string
  /** The widest a count can be (the inbox's size): the group headings' slots. */
  maxCount: number
  handle: Ref<PaperListHandle>
  /**
   * The box the list scrolls in (the list column beside the reading pane); null: the window (a
   * phone's or a tablet's page).
   */
  scroller: RefObject<HTMLElement | null> | null
}

/**
 * The view's papers, a feed of articles (role="feed") under group headings ("In scope · 11"): each
 * says its place among the papers shown (aria-posinset / aria-setsize), so a virtual list that draws
 * a window of them still tells where the reader is. Only the current paper is in the tab order.
 * A paper decided this session collapses where it was (grid rows 1fr → 0fr and its opacity) and
 * moves to "Decided this session".
 */
export function PaperList(props: PaperListProps) {
  const { entries, total } = entriesOf(props.groups, props.linked, props.linkedLabel)
  if (entries.length <= VIRTUALIZE_AFTER)
    return <PlainList {...props} entries={entries} total={total} />
  return props.scroller ? (
    <BoxList {...props} scroller={props.scroller} entries={entries} total={total} />
  ) : (
    <WindowList {...props} entries={entries} total={total} />
  )
}

/** Every row drawn. */
function PlainList(props: PaperListProps & { entries: Entry[]; total: number }) {
  const { entries, total, handle } = props
  useImperativeHandle(handle, () => ({
    // Every row is drawn: nothing to bring in (the page scrolls it into view itself).
    scrollToPaper: () => {},
  }))
  return (
    <Feed id={LIST_ID} label="Papers in this view">
      {entries.map((entry) => (
        <EntryView key={entry.key} {...props} entry={entry} total={total} />
      ))}
    </Feed>
  )
}

function Feed({
  id,
  label,
  children,
  height,
  ref,
}: {
  id: string
  label: string
  children: ReactNode
  height?: number
  ref?: Ref<HTMLDivElement>
}) {
  return (
    <div
      ref={ref}
      id={id}
      role="feed"
      aria-label={label}
      aria-describedby="inbox-keys-hint"
      style={height === undefined ? undefined : { height }}
      className={cn(height !== undefined && "relative")}
    >
      {children}
    </div>
  )
}

function EntryView({
  entry,
  total,
  maxCount,
  top,
  measure,
  index,
  ...ctx
}: RowContext & {
  entry: Entry
  total: number
  maxCount: number
  top?: number
  measure?: (el: HTMLElement | null) => void
  index?: number
}) {
  const style: CSSProperties | undefined =
    top === undefined ? undefined : { transform: `translateY(${top}px)` }
  const virtual = top !== undefined
  if (entry.kind === "header") {
    return (
      <div
        ref={measure}
        data-index={index}
        data-collapsed={entry.collapsed || undefined}
        aria-hidden={entry.collapsed || undefined}
        inert={entry.collapsed || undefined}
        style={style}
        className={cn(COLLAPSE, virtual && "absolute inset-x-0 top-0")}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="group/heading flex items-baseline gap-[0.4em] border-b border-border pt-5 pb-1.5 pl-2 label sm:pl-2.5">
            {entry.label}
            <span aria-hidden>·</span>
            <Count n={entry.count} max={maxCount} className="text-left font-sans text-small" />
            {ctx.onSelectGroup && entry.group !== "linked" && entry.count > 1 && !ctx.compact ? (
              // A pointer's sweep ("Select 19", then r): the keyboard's is Shift+X on a paper of
              // the group, so the button stays out of the tab order and of the feed's children.
              <button
                type="button"
                tabIndex={-1}
                aria-hidden
                title={`Select the ${entry.count} papers of “${entry.label}” (Shift+X)`}
                onClick={() => ctx.onSelectGroup?.(entry.group)}
                className="ml-auto rounded-[2px] pr-1 font-sans text-small font-normal tracking-normal text-muted-foreground opacity-0 transition-opacity duration-150 [font-variant-caps:normal] group-hover/heading:opacity-100 hover:text-foreground pointer-coarse:opacity-100"
              >
                Select {formatNumber(entry.count)}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    )
  }
  const { row, collapsed } = entry
  const id = row.paper.id
  const failure = ctx.failures.get(id)
  return (
    <div
      ref={measure}
      data-index={index}
      data-collapsed={collapsed || undefined}
      aria-hidden={collapsed || undefined}
      inert={collapsed || undefined}
      style={style}
      className={cn(COLLAPSE, virtual && "absolute inset-x-0 top-0")}
    >
      <div className="min-h-0 overflow-hidden">
        <PaperRow
          paper={row.paper}
          status={row.status}
          pending={row.pending}
          decided={row.decided}
          position={entry.position}
          total={total}
          active={!collapsed && id === ctx.active}
          selected={ctx.selected.has(id)}
          selecting={ctx.selecting}
          compact={ctx.compact}
          opens={ctx.opens}
          showFound={ctx.showFound}
          ghost={collapsed}
          failedDecision={failure?.decision ?? null}
          failedReason={failure?.reason ?? null}
          handlers={ctx.handlers}
        />
      </div>
    </div>
  )
}

/**
 * A row or a heading that collapses: its height (240 ms) and its opacity (150 ms), then out of
 * sight; coming back (an undo), visible at once, then the same way back.
 */
const COLLAPSE = cn(
  "grid grid-rows-[1fr] [transition:grid-template-rows_var(--dur-panel)_var(--ease-in-out),opacity_var(--dur-hover)_var(--ease-out)]",
  "data-collapsed:invisible data-collapsed:grid-rows-[0fr] data-collapsed:opacity-0 data-collapsed:[transition:grid-template-rows_var(--dur-panel)_var(--ease-in-out),opacity_var(--dur-hover)_var(--ease-out),visibility_0s_linear_var(--dur-panel)]"
)

/**
 * Where the list starts in what scrolls it (the virtualizer's scroll margin), kept current: on the
 * page (the window), or in its box.
 */
function useOffsetTop(
  ref: RefObject<HTMLElement | null>,
  scroller: RefObject<HTMLElement | null> | null
): number {
  const [offset, setOffset] = useState(0)
  useLayoutEffect(() => {
    const measure = () => {
      const el = ref.current
      if (!el) return
      const box = scroller?.current
      const top = box
        ? el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop
        : el.getBoundingClientRect().top + window.scrollY
      const rounded = Math.round(top)
      setOffset((was) => (was === rounded ? was : rounded))
    }
    measure()
    // What sits above the list (a notice, the selection bar, the toolbar wrapping) moves it.
    const observer = new ResizeObserver(measure)
    const around = scroller?.current ?? ref.current?.closest("main") ?? document.body
    observer.observe(around)
    if (around.firstElementChild) observer.observe(around.firstElementChild)
    window.addEventListener("resize", measure)
    return () => {
      observer.disconnect()
      window.removeEventListener("resize", measure)
    }
  }, [ref, scroller])
  return offset
}

type ListOf = PaperListProps & { entries: Entry[]; total: number }

/** The virtualizer's options both kinds of list share. */
function virtualOptions({ entries, active, compact }: ListOf, offset: number) {
  const activeIndex =
    active === null
      ? -1
      : entries.findIndex((e) => e.kind === "row" && !e.collapsed && e.row.paper.id === active)
  return {
    count: entries.length,
    estimateSize: (i: number) => {
      const e = entries[i]
      if (!e) return 64
      if (e.kind === "header") return 44
      return e.collapsed ? 0 : compact ? 70 : 64
    },
    getItemKey: (i: number) => entries[i]?.key ?? i,
    overscan: 8,
    scrollMargin: offset,
    // The current paper stays drawn wherever the list scrolls: it holds the tab stop and maybe the
    // focus, and an unmounted element would drop both.
    rangeExtractor: (range: Range) => {
      const indexes = defaultRangeExtractor(range)
      if (activeIndex >= 0 && !indexes.includes(activeIndex)) {
        indexes.push(activeIndex)
        indexes.sort((a, b) => a - b)
      }
      return indexes
    },
  }
}

/** A virtual list in the window (phones, tablets). */
function WindowList(props: ListOf) {
  // The virtualizer keeps mutable state the compiler cannot see: render it without memoization.
  "use no memo"
  const listRef = useRef<HTMLDivElement>(null)
  const offset = useOffsetTop(listRef, null)
  const virtualizer = useWindowVirtualizer(virtualOptions(props, offset))
  return <Virtual {...props} virtualizer={virtualizer} listRef={listRef} offset={offset} />
}

/** A virtual list in its own scrolling box (the list column beside the reading pane). */
function BoxList(props: ListOf & { scroller: RefObject<HTMLElement | null> }) {
  "use no memo"
  const listRef = useRef<HTMLDivElement>(null)
  const offset = useOffsetTop(listRef, props.scroller)
  // eslint-disable-next-line react-hooks/incompatible-library -- opted out of memoization above
  const virtualizer = useVirtualizer({
    ...virtualOptions(props, offset),
    getScrollElement: () => props.scroller.current,
    // Rows on the first paint (the box is measured after it): the current one takes the focus.
    initialRect: { width: 0, height: typeof window === "undefined" ? 0 : window.innerHeight },
  })
  return <Virtual {...props} virtualizer={virtualizer} listRef={listRef} offset={offset} />
}

function Virtual({
  virtualizer,
  listRef,
  offset,
  ...props
}: ListOf & {
  virtualizer: Virtualizer<Window, Element> | Virtualizer<HTMLElement, Element>
  listRef: RefObject<HTMLDivElement | null>
  offset: number
}) {
  "use no memo"
  const { entries, total, handle } = props
  useImperativeHandle(handle, () => ({
    scrollToPaper: (id, align) => {
      const i = entries.findIndex((e) => e.kind === "row" && !e.collapsed && e.row.paper.id === id)
      if (i >= 0) virtualizer.scrollToIndex(i, { align })
    },
  }))
  return (
    <Feed
      id={LIST_ID}
      label="Papers in this view"
      ref={listRef}
      height={virtualizer.getTotalSize()}
    >
      {virtualizer.getVirtualItems().map((item) => {
        const entry = entries[item.index]!
        return (
          <EntryView
            key={entry.key}
            {...props}
            entry={entry}
            total={total}
            index={item.index}
            top={item.start - offset}
            measure={virtualizer.measureElement}
          />
        )
      })}
    </Feed>
  )
}

/**
 * The papers decided this session, under a disclosure at the end of the list ("Decided this
 * session · 3"), collapsed by default; opened, they are a feed of their own and j/k walk into it.
 */
export function DecidedGroup({
  rows,
  open,
  onOpenChange,
  maxCount,
  ...ctx
}: RowContext & {
  rows: readonly InboxRow[]
  open: boolean
  onOpenChange: (open: boolean) => void
  maxCount: number
}) {
  if (!rows.length) return null
  return (
    <section aria-label="Decided this session" className="mt-1">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? DECIDED_ID : undefined}
        onClick={() => onOpenChange(!open)}
        className="group/decided flex w-full items-baseline gap-[0.4em] rounded-[2px] border-b border-border pt-5 pb-1.5 pl-2 text-left label focus-inset transition-colors hover:text-foreground sm:pl-2.5"
      >
        <ChevronRightIcon
          aria-hidden
          className={cn(
            "size-3.5 shrink-0 translate-y-[0.15em] self-start transition-transform duration-150",
            open && "rotate-90"
          )}
        />
        Decided this session
        <span aria-hidden>·</span>
        <Count n={rows.length} max={maxCount} className="text-left font-sans text-small" />
      </button>
      {open ? (
        <Feed id={DECIDED_ID} label="Papers decided this session">
          {rows.map((row, i) => (
            <PaperRow
              key={row.paper.id}
              paper={row.paper}
              status={row.status}
              pending={row.pending}
              decided
              position={i + 1}
              total={rows.length}
              active={row.paper.id === ctx.active}
              selected={false}
              selecting={false}
              compact={ctx.compact}
              opens={ctx.opens}
              showFound={false}
              handlers={ctx.handlers}
            />
          ))}
        </Feed>
      ) : null}
    </section>
  )
}
