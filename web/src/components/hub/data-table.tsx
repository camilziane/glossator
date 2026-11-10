"use client"

import { type ReactTable, type Row } from "@tanstack/react-table"
import { useVirtualizer, useWindowVirtualizer, type VirtualItem } from "@tanstack/react-virtual"
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react"
import {
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from "react"

import { cn } from "@/lib/utils"

import { CellPopover, useCellPopover } from "./cell-popover"
import { useClampMeasure } from "./clamp-measure"
import { RowLinesContext } from "./hub-context"
import { columnLayout, type HubRow } from "./model"
import { type HubColumnMeta, type HubFeatures } from "./table-features"
import { type RowLines } from "./use-row-lines"

/** Beyond this many rows only the rows near the viewport are drawn (spacer rows hold the rest). */
export const VIRTUALIZE_AFTER = 150

const ROW_ESTIMATE: Record<RowLines, number> = { "1": 46, "2": 56, full: 120 }

type HubReactTable<R extends HubRow> = ReactTable<HubFeatures, R>

export interface HubDataTableProps<R extends HubRow> {
  table: HubReactTable<R>
  /** The table's accessible name. */
  label: string
  lines: RowLines
  /** The current row (the table's tab stop, the one previewed); null or gone: the first. */
  current: string | null
  onCurrentChange: (id: string) => void
  /** Opens a row (Enter, a double click); `newTab` with ⌘/Ctrl or the middle button. */
  onOpenRow?: (row: R, newTab: boolean) => void
  /** Shows a row in the preview (Space, a click outside its title). */
  onPreviewRow?: (row: R) => void
  /** The row the preview shows: marked. */
  previewing?: string | null
  /** The keys a row answers (`aria-keyshortcuts`: "Enter Space p c"). */
  rowKeys?: string
  /** The page's own keys on a focused row (p, c, Tab into the preview): true when handled. */
  onRowKey?: (event: KeyboardEvent<HTMLElement>, row: R) => boolean
  /** What the body shows when no row is left. */
  empty: ReactNode
  /** The body (to find a row's element). */
  bodyRef?: RefObject<HTMLTableSectionElement | null>
  className?: string
}

/** A value for an attribute selector (`[data-row-id="…"]`). */
export function attr(value: string): string {
  return value.replace(/["\\]/g, "\\$&")
}

/** Where a row's element is, by its id (the table's rows carry `data-row-id`). */
export function rowElement(
  body: HTMLElement | null | undefined,
  id: string | null
): HTMLTableRowElement | null {
  if (!body || id === null) return null
  return body.querySelector<HTMLTableRowElement>(`tr[data-row-id="${attr(id)}"]`)
}

/*
 * The table's text sits on the page's gutters (its first and last cells have no outer padding).
 * A hovered row takes the wash, which bleeds 12 px into the gutters; the current row (focused, or
 * shown in the preview) takes it too, with a 2 px ink bar hanging in the left gutter: the list's
 * own focus mark (a full outline around a wide row is noise), as in menus. In a box that scrolls
 * sideways (nothing may hang outside it) the cells keep their padding and the bar is inside.
 */
const CELL = "px-2.5 py-2"
const FIRST =
  "pl-0 group-data-[boxed]/box:pl-3 group-hover/row:shadow-[-12px_0_0_var(--muted)] group-focus-within/row:shadow-[-12px_0_0_var(--muted),-14px_0_0_var(--foreground)] group-data-[previewing]/row:shadow-[-12px_0_0_var(--muted),-14px_0_0_var(--foreground)] group-data-[boxed]/box:group-hover/row:shadow-none group-data-[boxed]/box:group-focus-within/row:shadow-[inset_2px_0_0_var(--foreground)] group-data-[boxed]/box:group-data-[previewing]/row:shadow-[inset_2px_0_0_var(--foreground)]"
const LAST =
  "pr-0 group-data-[boxed]/box:pr-3 group-hover/row:shadow-[12px_0_0_var(--muted)] group-focus-within/row:shadow-[12px_0_0_var(--muted)] group-data-[previewing]/row:shadow-[12px_0_0_var(--muted)] group-data-[boxed]/box:shadow-none!"
const ROW_MARK = "group-focus-within/row:bg-muted group-data-[previewing]/row:bg-muted"

/** Print keeps the Rows setting: one or two lines, at most four for Full. */
const PRINT_LINES: Record<RowLines, number> = { "1": 1, "2": 2, full: 4 }

const INTERACTIVE = "a, button, input, select, textarea, label, summary, [role=button]"

/** Pinned cells stay on the paper (what scrolls under them must not show) and cast a shadow once
 * the table has scrolled under them. */
function pinClasses(pin: HubColumnMeta["pin"], head = false): string {
  if (!pin) return ""
  return cn(
    "sticky print:static",
    // Above the other heads, below the top bar (z-30), whose hairline it must not cover.
    head ? "z-[25]" : "z-10",
    "after:pointer-events-none after:absolute after:inset-y-0 after:w-2.5 after:opacity-0 after:transition-opacity after:duration-150 print:after:hidden",
    pin === "left"
      ? "left-0 after:-right-2.5 after:bg-[linear-gradient(to_right,color-mix(in_oklab,var(--foreground)_10%,transparent),transparent)] group-data-[scrolled-start]/box:after:opacity-100"
      : "right-0 after:-left-2.5 after:bg-[linear-gradient(to_left,color-mix(in_oklab,var(--foreground)_10%,transparent),transparent)] group-data-[scrolled-end]/box:after:opacity-100"
  )
}

/**
 * A hub table on wide screens. When its columns fit, it flows with the page and its head sticks
 * under the top bar; when they do not, it becomes a box of the window's height scrolling both ways,
 * its head sticky, the Article column pinned on the left and the key metrics on the right (each
 * casting a shadow over what scrolls under it). Column widths come from the model and the measured
 * width (fixed layout: rows never shift). Heads sort (aria-sort; the chevron only on the sorted
 * one, and on hover). One row is in the tab order: ↑ ↓ move, → ← walk its cells (a cut cell offers
 * its whole text after 400 ms, as on hover), Enter opens, Space previews. Beyond VIRTUALIZE_AFTER
 * rows only the visible ones are drawn.
 */
export function HubDataTable<R extends HubRow>(props: HubDataTableProps<R>) {
  const { table, label, lines, empty, className } = props
  const boxRef = useRef<HTMLDivElement | null>(null)
  // The box's inner width in rem, measured (0 until then): the columns share it.
  const [available, setAvailable] = useState(0)
  const measure = (node: HTMLDivElement | null) => {
    boxRef.current = node
    if (!node) return
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
    const observer = new ResizeObserver(() =>
      setAvailable(Math.max(0, Math.floor(node.clientWidth) - 1) / rem)
    )
    observer.observe(node)
    // Which edges can still scroll: the pinned columns cast their shadows then.
    const edges = () => {
      // Only a box that scrolls sideways has edges to cast shadows over.
      const boxed = node.hasAttribute("data-boxed")
      const start = boxed && node.scrollLeft > 1
      const end = boxed && node.scrollLeft + node.clientWidth < node.scrollWidth - 1
      node.toggleAttribute("data-scrolled-start", start)
      node.toggleAttribute("data-scrolled-end", end)
    }
    let frame = 0
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(() => ((frame = 0), edges()))
    }
    edges()
    node.addEventListener("scroll", onScroll, { passive: true })
    const resized = new ResizeObserver(edges)
    resized.observe(node)
    return () => {
      observer.disconnect()
      resized.disconnect()
      node.removeEventListener("scroll", onScroll)
      cancelAnimationFrame(frame)
    }
  }

  const rows = table.getRowModel().rows
  const columns = table.getVisibleLeafColumns()
  const layout = columnLayout(
    columns.map((c) => ({ min: c.columnDef.meta?.min ?? 8, ideal: c.columnDef.meta?.ideal ?? 8 })),
    available
  )
  const boxed = available > 0 && layout.width > available
  const virtual = rows.length > VIRTUALIZE_AFTER
  const popover = useCellPopover()
  // Which cells cut their text: measured once per layout (rows, columns, lines, width).
  useClampMeasure(boxRef, [
    rows.map((r) => r.id).join("|"),
    columns.map((c) => c.id).join("|"),
    lines,
    boxed,
  ])

  return (
    <RowLinesContext value={lines}>
      <div
        ref={measure}
        className={cn(
          "group/box relative",
          boxed
            ? "max-h-[calc(100dvh-var(--header-height)-1rem)] overflow-auto scroll-shadow overscroll-x-contain border-y border-border print:max-h-none print:overflow-visible print:border-0"
            : // The row's wash and bar hang into the gutters: clip beyond them only.
              "overflow-clip [overflow-clip-margin:16px]",
          className
        )}
        data-slot="hub-table"
        data-boxed={boxed || undefined}
        {...popover.listeners}
      >
        <table
          aria-label={label}
          aria-rowcount={virtual ? rows.length + 1 : undefined}
          data-lines={lines}
          className="table-fixed border-separate border-spacing-0 font-sans text-table [font-stretch:92%] print:w-full! print:text-[8.5pt] print:leading-[1.3]"
          style={
            {
              width: available > 0 ? `${layout.width}rem` : "100%",
              "--print-lines": PRINT_LINES[lines],
            } as CSSProperties
          }
        >
          <colgroup>
            {columns.map((c, i) => (
              <col
                key={c.id}
                style={
                  available > 0
                    ? { width: `${(((layout.widths[i] ?? 8) / layout.width) * 100).toFixed(3)}%` }
                    : undefined
                }
              />
            ))}
          </colgroup>
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header, h) => {
                  const column = header.column
                  const meta = column.columnDef.meta
                  const title = meta?.title ?? column.id
                  const sorted = column.getIsSorted()
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={
                        sorted === "asc"
                          ? "ascending"
                          : sorted === "desc"
                            ? "descending"
                            : undefined
                      }
                      className={cn(
                        "group/th sticky z-20 border-b border-foreground bg-background px-2.5 pt-3 pb-1.5 text-left align-bottom font-normal print:static print:bg-transparent",
                        h === 0 && "pl-0 group-data-[boxed]/box:pl-3",
                        h > 0 &&
                          h === group.headers.length - 1 &&
                          "pr-0 group-data-[boxed]/box:pr-3",
                        boxed ? "top-0" : "top-(--header-height)",
                        meta?.numeric && "text-right",
                        pinClasses(meta?.pin, true)
                      )}
                    >
                      {/* On paper the label alone (a repeated head drops a button's text). */}
                      <span className="hidden label break-words print:block">{title}</span>
                      {column.getCanSort() ? (
                        <button
                          type="button"
                          onClick={column.getToggleSortingHandler()}
                          className={cn(
                            "inline-flex max-w-full items-baseline gap-1 text-left label transition-colors duration-150 hover:text-foreground print:hidden",
                            meta?.numeric && "whitespace-nowrap",
                            sorted && "text-foreground",
                            meta?.numeric && "flex-row-reverse text-right"
                          )}
                        >
                          <span className="min-w-0 break-words">{title}</span>
                          <SortChevron sorted={sorted} />
                        </button>
                      ) : (
                        <span className="block label break-words print:hidden">{title}</span>
                      )}
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          {rows.length === 0 ? (
            <tbody>
              <tr>
                <td colSpan={columns.length} className="px-2.5 py-2">
                  {empty}
                </td>
              </tr>
            </tbody>
          ) : virtual && boxed ? (
            <BoxVirtualBody {...props} rows={rows} boxRef={boxRef} />
          ) : virtual ? (
            <WindowVirtualBody {...props} rows={rows} />
          ) : (
            <PlainBody {...props} rows={rows} />
          )}
        </table>
      </div>
      <CellPopover state={popover} table={table} rows={rows} />
    </RowLinesContext>
  )
}

/** The sort chevron: shown on the sorted column, and faintly on a head the pointer is over. */
function SortChevron({ sorted }: { sorted: false | "asc" | "desc" }) {
  const Icon = sorted === "asc" ? ChevronUpIcon : ChevronDownIcon
  return (
    <Icon
      aria-hidden
      className={cn(
        "size-3 shrink-0 translate-y-px transition-opacity duration-150 print:hidden",
        sorted ? "opacity-100" : "opacity-0 group-hover/th:opacity-50"
      )}
    />
  )
}

type BodyProps<R extends HubRow> = HubDataTableProps<R> & { rows: Row<HubFeatures, R>[] }

/**
 * The keys of the rows and their cells, on the body (one listener): ↑ ↓ PgUp PgDn Home End move the
 * row (or, from a cell, the same column of the next row), → ← walk the cells of the row (← from its
 * first returns to the row), Esc from a cell returns to the row, Enter opens, Space previews; any
 * other plain key goes to the page (`onRowKey`). A link or a button inside a cell keeps its keys.
 */
function useRowKeys<R extends HubRow>(
  { rows, onOpenRow, onPreviewRow, onRowKey }: BodyProps<R>,
  reveal?: (index: number) => void
) {
  const focusAt = (body: HTMLElement, index: number, col: number) => {
    const target = Math.max(0, Math.min(rows.length - 1, index))
    const find = () => {
      const tr = body.querySelector<HTMLElement>(`tr[data-row-index="${target}"]`)
      if (!tr || col < 0) return tr
      const cells = tr.querySelectorAll<HTMLElement>("[data-cell]")
      return cells[Math.min(col, cells.length - 1)] ?? tr
    }
    const show = (el: HTMLElement) => {
      el.focus({ preventScroll: true })
      // The row clears the sticky head (its scroll margin); a cell comes into view sideways.
      el.closest("tr")?.scrollIntoView?.({ block: "nearest" })
      if (el.tagName !== "TR") el.scrollIntoView?.({ block: "nearest", inline: "nearest" })
    }
    const el = find()
    if (el) return show(el)
    reveal?.(target)
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const later = find()
        if (later) show(later)
      })
    )
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTableSectionElement>) => {
    if (event.altKey) return
    const target = event.target as HTMLElement
    const tr = target.closest<HTMLTableRowElement>("tr[data-row-index]")
    if (!tr) return
    const onRow = target === tr
    const cell = onRow ? null : target.closest<HTMLElement>("[data-cell]")
    // A link or a button inside a cell keeps its own keys.
    if (!onRow && cell !== target) return
    const index = Number(tr.dataset.rowIndex)
    const row = rows[index]
    if (!row) return
    const cells = [...tr.querySelectorAll<HTMLElement>("[data-cell]")]
    const col = cell ? cells.indexOf(cell) : -1
    const body = event.currentTarget
    const mod = event.metaKey || event.ctrlKey
    switch (event.key) {
      case "ArrowDown":
        focusAt(body, index + 1, col)
        break
      case "ArrowUp":
        focusAt(body, index - 1, col)
        break
      case "PageDown":
        focusAt(body, index + 10, col)
        break
      case "PageUp":
        focusAt(body, index - 10, col)
        break
      case "Home":
        if (col >= 0) cells[0]?.focus()
        else focusAt(body, 0, -1)
        break
      case "End":
        if (col >= 0) cells.at(-1)?.focus()
        else focusAt(body, rows.length - 1, -1)
        break
      case "ArrowRight":
        if (col + 1 >= cells.length) return
        cells[col + 1]?.focus()
        break
      case "ArrowLeft":
        if (col < 0) return
        if (col === 0) tr.focus()
        else cells[col - 1]?.focus()
        break
      case "Escape":
        if (col < 0) return
        tr.focus()
        break
      case "Enter":
        if (!onOpenRow) return
        onOpenRow(row.original, mod)
        break
      case " ":
        if (!onPreviewRow || mod) return
        onPreviewRow(row.original)
        break
      default:
        if (mod || !onRowKey?.(event, row.original)) return
    }
    event.preventDefault()
  }

  const onClick = (event: MouseEvent<HTMLTableRowElement>, row: R) => {
    if ((event.target as Element).closest(INTERACTIVE)) return
    // Selecting text in a row is not opening it.
    if (window.getSelection()?.toString()) return
    const newTab = event.metaKey || event.ctrlKey || event.button === 1
    if (newTab) onOpenRow?.(row, true)
    else if (onPreviewRow) onPreviewRow(row)
  }

  return { onKeyDown, onClick }
}

function BodyRow<R extends HubRow>({
  table,
  row,
  index,
  tabbable,
  previewing,
  clickable,
  onFocusRow,
  onClick,
  onOpen,
  measure,
  ariaRowIndex,
  keys,
}: {
  table: HubReactTable<R>
  row: Row<HubFeatures, R>
  index: number
  tabbable: boolean
  previewing: boolean
  clickable: boolean
  onFocusRow: (id: string) => void
  onClick: (event: MouseEvent<HTMLTableRowElement>, row: R) => void
  onOpen?: (row: R, newTab: boolean) => void
  measure?: (node: HTMLTableRowElement | null) => void
  ariaRowIndex?: number
  keys?: string
}) {
  const cells = row.getVisibleCells()
  return (
    <tr
      ref={measure}
      data-index={index}
      data-row-index={index}
      data-row-id={row.id}
      data-previewing={previewing || undefined}
      aria-rowindex={ariaRowIndex}
      aria-keyshortcuts={keys}
      tabIndex={tabbable ? 0 : -1}
      onFocus={() => onFocusRow(row.id)}
      onClick={(e) => onClick(e, row.original)}
      onAuxClick={(e) => {
        if (e.button === 1) onClick(e, row.original)
      }}
      onDoubleClick={(e) => {
        if (!onOpen || (e.target as Element).closest(INTERACTIVE)) return
        window.getSelection()?.removeAllRanges()
        onOpen(row.original, false)
      }}
      className={cn(
        // A tall row may break across printed pages (the head repeats on each).
        "group/row scroll-mt-24 outline-none",
        clickable && "cursor-default"
      )}
    >
      {cells.map((cell, i) => {
        const meta = cell.column.columnDef.meta
        return (
          <td
            key={cell.id}
            data-col-id={cell.column.id}
            className={cn(
              "border-b border-border bg-background align-top transition-[background-color,box-shadow] duration-150 group-hover/row:bg-muted print:bg-transparent! print:shadow-none! print:transition-none",
              CELL,
              ROW_MARK,
              i === 0 && FIRST,
              i === cells.length - 1 && i > 0 && LAST,
              meta?.numeric && "text-right num",
              pinClasses(meta?.pin)
            )}
          >
            <table.FlexRender cell={cell} />
          </td>
        )
      })}
    </tr>
  )
}

/** The id of the row in the tab order: the current one, else the first. */
function tabStop<R extends HubRow>(rows: Row<HubFeatures, R>[], current: string | null) {
  return current !== null && rows.some((r) => r.id === current) ? current : (rows[0]?.id ?? null)
}

function PlainBody<R extends HubRow>(props: BodyProps<R>) {
  const { table, rows, current, previewing, onCurrentChange, onOpenRow, onPreviewRow, bodyRef } =
    props
  const keys = useRowKeys(props)
  const stop = tabStop(rows, current)
  return (
    <tbody ref={bodyRef} onKeyDown={keys.onKeyDown}>
      {rows.map((row, index) => (
        <BodyRow
          key={row.id}
          table={table}
          row={row}
          index={index}
          tabbable={row.id === stop}
          previewing={row.id === previewing}
          clickable={!!(onOpenRow || onPreviewRow)}
          onFocusRow={onCurrentChange}
          onClick={keys.onClick}
          onOpen={onOpenRow}
          keys={props.rowKeys}
        />
      ))}
    </tbody>
  )
}

/** Where the body starts in its scroller's content (the head's height, or the page offset). */
function useBodyOffset(
  origin: "box" | "window",
  bodyRef?: RefObject<HTMLTableSectionElement | null>
) {
  const [offset, setOffset] = useState(0)
  const ref = (node: HTMLTableSectionElement | null) => {
    if (bodyRef) bodyRef.current = node
    if (!node) return
    const read = () =>
      setOffset(
        origin === "window"
          ? node.getBoundingClientRect().top + window.scrollY
          : (node.closest("table")?.offsetTop ?? 0) + node.offsetTop
      )
    read()
    const observer = new ResizeObserver(read)
    observer.observe(document.body)
    return () => observer.disconnect()
  }
  return [offset, ref] as const
}

function VirtualRows<R extends HubRow>(
  props: BodyProps<R> & {
    items: VirtualItem[]
    totalSize: number
    offset: number
    measureElement: (node: HTMLTableRowElement | null) => void
  }
) {
  const { table, rows, items, totalSize, offset, measureElement, current, previewing } = props
  const first = items[0]
  const last = items[items.length - 1]
  const top = first ? first.start - offset : 0
  const bottom = last ? totalSize - (last.end - offset) : 0
  const span = table.getVisibleLeafColumns().length
  const keys = useRowKeys(props)
  const stop = tabStop(rows, current)
  return (
    <>
      {top > 0 ? (
        <tr aria-hidden>
          <td colSpan={span} style={{ height: top }} className="p-0" />
        </tr>
      ) : null}
      {items.map((item) => {
        const row = rows[item.index]!
        return (
          <BodyRow
            key={row.id}
            table={table}
            row={row}
            index={item.index}
            ariaRowIndex={item.index + 2}
            tabbable={row.id === stop}
            previewing={row.id === previewing}
            clickable={!!(props.onOpenRow || props.onPreviewRow)}
            measure={measureElement}
            onFocusRow={props.onCurrentChange}
            onClick={keys.onClick}
            onOpen={props.onOpenRow}
            keys={props.rowKeys}
          />
        )
      })}
      {bottom > 0 ? (
        <tr aria-hidden>
          <td colSpan={span} style={{ height: bottom }} className="p-0" />
        </tr>
      ) : null}
    </>
  )
}

function BoxVirtualBody<R extends HubRow>(
  props: BodyProps<R> & { boxRef: RefObject<HTMLDivElement | null> }
) {
  // The virtualizer keeps mutable state the compiler cannot see: render it without memoization.
  "use no memo"
  const { rows, boxRef, lines } = props
  const [offset, bodyRef] = useBodyOffset("box", props.bodyRef)
  // eslint-disable-next-line react-hooks/incompatible-library -- opted out of memoization above
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => boxRef.current,
    estimateSize: () => ROW_ESTIMATE[lines],
    getItemKey: (i) => rows[i]?.id ?? i,
    overscan: 8,
    scrollMargin: offset,
  })
  const keys = useRowKeys(props, (i) => virtualizer.scrollToIndex(i, { align: "auto" }))
  return (
    <tbody ref={bodyRef} onKeyDown={keys.onKeyDown}>
      <VirtualRows
        {...props}
        items={virtualizer.getVirtualItems()}
        totalSize={virtualizer.getTotalSize()}
        offset={offset}
        measureElement={virtualizer.measureElement}
      />
    </tbody>
  )
}

function WindowVirtualBody<R extends HubRow>(props: BodyProps<R>) {
  // The virtualizer keeps mutable state the compiler cannot see: render it without memoization.
  "use no memo"
  const { rows, lines } = props
  const [offset, bodyRef] = useBodyOffset("window", props.bodyRef)
  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => ROW_ESTIMATE[lines],
    getItemKey: (i) => rows[i]?.id ?? i,
    overscan: 8,
    scrollMargin: offset,
  })
  const keys = useRowKeys(props, (i) => virtualizer.scrollToIndex(i, { align: "auto" }))
  return (
    <tbody ref={bodyRef} onKeyDown={keys.onKeyDown}>
      <VirtualRows
        {...props}
        items={virtualizer.getVirtualItems()}
        totalSize={virtualizer.getTotalSize()}
        offset={offset}
        measureElement={virtualizer.measureElement}
      />
    </tbody>
  )
}
