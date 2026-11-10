"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"

import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { plainText, type TableBlock } from "@/lib/data"
import { typeset } from "@/lib/typeset"
import { cn } from "@/lib/utils"

import { useMediaQuery } from "@/hooks/use-media-query"

import { columnWidths } from "./article-model"
import { InlineWithPages } from "./inline-pages"

type Width = "nowrap" | "narrow" | "medium" | "wide"

const WIDTH_CLASS: Record<Width, string> = {
  nowrap: "whitespace-nowrap",
  narrow: "min-w-[5.5rem]",
  medium: "min-w-[8rem]",
  wide: "min-w-[11rem]",
}

/** How wide a column should be, from the length of its cells' text: short ones never wrap. */
export function columnWidth(lengths: readonly number[]): Width {
  if (lengths.length === 0) return "narrow"
  const sorted = [...lengths].sort((a, b) => a - b)
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0
  const median = at(0.5)
  const p90 = at(0.9)
  if ((sorted[sorted.length - 1] ?? 0) <= 16) return "nowrap"
  if (median >= 60 || p90 >= 150) return "wide"
  if (median >= 25 || p90 >= 80) return "medium"
  return "narrow"
}

/** Whether a box scrolls sideways (then the keyboard may reach it to scroll it: WCAG 2.1.1). */
export function useScrolls() {
  const ref = useRef<HTMLDivElement>(null)
  const [scrolls, setScrolls] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === "undefined") return
    const update = () => setScrolls(el.scrollWidth - el.clientWidth > 1)
    const resize = new ResizeObserver(update)
    resize.observe(el)
    if (el.firstElementChild) resize.observe(el.firstElementChild)
    return () => resize.disconnect()
  }, [])
  return { ref, scrolls }
}

/**
 * The frame of an article's table: it scrolls sideways when narrower than the table and says so
 * with shadows at its edges (`scroll-shadow`); a named region, reachable by the keyboard then.
 */
export function TableFrame({
  label,
  children,
  className,
}: {
  label?: string
  children: ReactNode
  className?: string
}) {
  const { ref, scrolls } = useScrolls()
  return (
    <div
      ref={ref}
      role="region"
      aria-label={label ?? "Table"}
      tabIndex={scrolls ? 0 : undefined}
      className={cn(
        "relative scroll-shadow overscroll-x-contain focus-inset print:overflow-visible print:bg-none",
        className
      )}
    >
      {children}
    </div>
  )
}

/** The table element itself: the sans at 13.5/19 and 92 % width, no hyphenation. */
export const TABLE_CLASS =
  "w-full border-collapse text-left font-sans text-table hyphens-none [font-stretch:92%] tabular-nums"

/** From 1024 px a table across the text and the margin has its fixed width (about 880 px). */
export const FIXED_QUERY = "(min-width: 64rem)"

/**
 * A table of an article's section (results, sites): heads as labels over an ink rule, rows
 * on hairlines, cells in the sans with their page marks. From 1024 px, a fixed layout shares the
 * width by what the columns hold (`columnWidths`), so a table that nearly fits wraps instead of
 * scrolling; one whose words alone do not fit, and every table on a narrow screen, scrolls sideways
 * and says so.
 */
export function TableBlockView({
  block,
  pdf,
  label,
}: {
  block: TableBlock
  pdf: string | null
  label?: string
}) {
  const wide = useMediaQuery(FIXED_QUERY)
  const shares = wide ? columnWidths(block.head, block.rows) : null
  const fixed = shares !== null
  const widths = block.head.map((_, j) =>
    columnWidth(block.rows.map((r) => plainText(r[j] ?? []).length))
  )
  return (
    <TableFrame label={label}>
      <table className={cn(TABLE_CLASS, fixed && "table-fixed")}>
        {shares ? (
          <colgroup>
            {shares.map((w, j) => (
              <col key={j} style={{ width: `${w.toFixed(2)}%` }} />
            ))}
          </colgroup>
        ) : null}
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {block.head.map((h, j) => (
              <TableHead
                key={j}
                scope="col"
                className={cn(
                  "h-auto pt-0 whitespace-normal",
                  !fixed && !h.includes(" ") && "whitespace-nowrap"
                )}
              >
                {typeset(h)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {block.rows.map((row, i) => (
            <TableRow key={i}>
              {block.head.map((_, j) => (
                <TableCell
                  key={j}
                  className={cn(
                    "break-words",
                    fixed
                      ? "whitespace-normal"
                      : ["max-w-[24rem]", WIDTH_CLASS[widths[j] ?? "narrow"]]
                  )}
                >
                  <InlineWithPages parts={row[j] ?? []} pdf={pdf} acronyms={false} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </table>
    </TableFrame>
  )
}
