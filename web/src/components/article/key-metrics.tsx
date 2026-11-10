"use client"

import { ChevronRightIcon } from "lucide-react"

import { Typeset } from "@/components/content/typeset"
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { plainText, type Inlines, type Section, type TableBlock } from "@/lib/data"
import { formatNumber } from "@/lib/format"
import { typeset } from "@/lib/typeset"
import { useMediaQuery } from "@/hooks/use-media-query"
import { cn } from "@/lib/utils"

import { useArticleContext } from "./article-context"
import {
  clauseOf,
  columnWidths,
  isMetricsTable,
  lowerFirst,
  metricColumns,
  metricRows,
  startsWithFigure,
  type MetricColumns,
} from "./article-model"
import { Blocks } from "./blocks"
import { CopyCitation, metricCitation, type Citation } from "./copy-citation"
import { noteFrame } from "./gloss-notes"
import { GlossedSection, SectionFrame } from "./glossed-section"
import { AT } from "./grid"
import { InlineWithPages } from "./inline-pages"
import { boldFigures, formatConfidence, splitConfidence, type MetricValue } from "./metric-value"
import { firstPageRef } from "./page-refs"
import { FIXED_QUERY, TABLE_CLASS, TableFrame } from "./table-block"

/** A metric name this short is followed by its condition in the sentence. */
const SHORT_METRIC = 40

/** A value cell read as text when it is only text (bold or not): links and marks keep their look. */
function readValue(cell: Inlines): MetricValue | null {
  const plain = cell.every((p) => typeof p === "string" || p.t === "b")
  return plain ? splitConfidence(plainText(cell).trim()) : null
}

interface Row {
  cells: Inlines[]
  starred: boolean
  value: MetricValue | null
}

function rowsOf(table: TableBlock, col: MetricColumns): Row[] {
  return metricRows(table).map((r) => ({
    ...r,
    value: col.value >= 0 ? readValue(r.cells[col.value] ?? []) : null,
  }))
}

/** The metric with its citation, for a row's copy control. */
function useRowCitation(): (row: Row, col: MetricColumns) => Citation | null {
  const { card, manuscript } = useArticleContext()
  return (row, col) => {
    if (!card) return null
    const text = (j: number) => (j >= 0 ? plainText(row.cells[j] ?? []).trim() : "")
    const source = col.source >= 0 ? firstPageRef(plainText(row.cells[col.source] ?? [])) : null
    return metricCitation(
      text(col.metric),
      text(col.value),
      text(col.condition),
      card,
      source,
      manuscript
    )
  }
}

// ---------------------------------------------------------------------------- the section

/**
 * The key metrics, first after the lede: each headline (★) metric as a sentence of the text ("**24%**
 * (P1), **14%**, **33%**: relative error, online…"), its source (its page marks) and its copy
 * control in the margin beside it; then the whole table under a disclosure ("All 8 metrics", which
 * `m` opens). Without headline rows, the table itself. Like Figures, a band of the page: no number.
 */
export function KeyMetricsSection({
  section,
  pdf,
  open,
  onOpenChange,
}: {
  section: Section
  pdf: string | null
  /** The table's disclosure is open (`m` opens it). */
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const cite = useRowCitation()
  const table = section.blocks.find(isMetricsTable)
  if (!table) return <GlossedSection section={section} pdf={pdf} />
  const col = metricColumns(table.head)
  const rows = rowsOf(table, col)
  const headline = rows.filter((r) => r.starred)
  if (headline.length === 0) return <GlossedSection section={section} pdf={pdf} />
  const rest = section.blocks.filter((b) => b !== table)
  const noun = section.title.trim().split(/\s+/u).pop()?.toLowerCase() || "metrics"
  return (
    <SectionFrame id={section.id} title={section.title}>
      {headline.map((row, i) => {
        const citation = cite(row, col)
        const source = col.source >= 0 ? (row.cells[col.source] ?? []) : []
        return (
          <div key={i} className="contents">
            <p className={cn(AT.text, "reading", i === 0 && "xl:row-start-1")}>
              <MetricSentence row={row} col={col} pdf={pdf} />
            </p>
            <aside className={cn(AT.gloss, i === 0 && "xl:row-start-1", "lg:pt-1")}>
              <p
                data-gloss-note=""
                data-copyable=""
                className={cn(
                  "group/copy gloss-note flex items-baseline gap-1 font-sans text-small text-muted-foreground",
                  noteFrame("margin")
                )}
              >
                <span className="min-w-0">
                  {source.length > 0 ? (
                    <InlineWithPages parts={source} pdf={pdf} acronyms={false} />
                  ) : null}
                </span>
                {citation ? (
                  <CopyCitation
                    citation={citation}
                    what="the metric"
                    className="-my-1 shrink-0 self-center"
                  />
                ) : null}
              </p>
            </aside>
          </div>
        )
      })}
      <div className={AT.wide}>
        <details
          id={`${section.id}-all`}
          data-print-open=""
          open={open}
          onToggle={(e) => onOpenChange(e.currentTarget.open)}
          className="group/all border-t border-border"
        >
          <summary className="flex cursor-pointer list-none items-baseline gap-2 py-2.5 select-none [&::-webkit-details-marker]:hidden">
            <ChevronRightIcon
              aria-hidden="true"
              className="size-3.5 shrink-0 translate-y-0.5 self-start text-muted-foreground transition-transform duration-150 group-open/all:rotate-90"
            />
            <span className="label">
              All {formatNumber(rows.length)} {noun}
            </span>
            <span className="sr-only">, with their conditions and sources</span>
          </summary>
          <div className="space-y-4 pt-1 pb-2">
            <KeyMetricsTable block={table} pdf={pdf} label={section.title} />
            {rest.length > 0 ? <Blocks blocks={rest} pdf={pdf} className="max-w-measure" /> : null}
          </div>
        </details>
      </div>
    </SectionFrame>
  )
}

/** "**24%** (P1), **14%** (P2): relative error, online … — its condition": a metric as a sentence. */
function MetricSentence({ row, col, pdf }: { row: Row; col: MetricColumns; pdf: string | null }) {
  const metric = col.metric >= 0 ? plainText(row.cells[col.metric] ?? []).trim() : ""
  // A short metric name says little without its condition; a long one is enough on its own.
  const condition =
    col.condition >= 0 && metric.length <= SHORT_METRIC
      ? clauseOf(row.cells[col.condition] ?? [], { max: 80 })
      : null
  const value = row.value
  return (
    <>
      {value ? (
        <MetricValueText text={value.value} />
      ) : col.value >= 0 ? (
        <InlineWithPages parts={row.cells[col.value] ?? []} pdf={pdf} />
      ) : null}
      {value?.ci ? (
        <span className="text-muted-foreground">
          {" "}
          ({value.ci.level}% CI {typeset(formatConfidence(value.ci))})
        </span>
      ) : null}
      {metric ? (
        <>
          : <Typeset text={lowerFirst(metric)} acronyms />
        </>
      ) : null}
      {condition && plainText(condition.parts).trim() ? (
        <span className="text-muted-foreground">
          {" — "}
          <InlineWithPages parts={condition.parts} pdf={pdf} />
          {condition.cut ? "…" : null}
        </span>
      ) : null}
    </>
  )
}

// ---------------------------------------------------------------------------- the table

/**
 * The key metrics table: headline rows first with their metric in bold; a value that starts with
 * a figure right-aligned in tabular figures, only its figures bold; a confidence interval written
 * at the end of a value in a muted column of its own; every row's copy control (the metric with its
 * citation; Shift: its LaTeX). A fixed layout: the table takes its column's width and wraps, never
 * scrolls. Below 640 px each row is a record: its metric, its value, its condition and source.
 */
export function KeyMetricsTable({
  block,
  pdf,
  label,
}: {
  block: TableBlock
  pdf: string | null
  label?: string
}) {
  const cite = useRowCitation()
  const col = metricColumns(block.head)
  const rows = rowsOf(block, col)
  const levels = new Set(rows.flatMap((r) => (r.value?.ci ? [r.value.ci.level] : [])))
  const hasCi = levels.size > 0
  const oneLevel = levels.size === 1 ? [...levels][0] : null
  // The star column is said by the metric's weight; the others in their order.
  const order = block.head.map((_, j) => j).filter((j) => j !== col.star)
  // A fixed layout from 1024 px (the copy column 2 rem): the shares of the others, by what they hold.
  const wide = useMediaQuery(FIXED_QUERY)
  const shown = rows.map((r) =>
    order.flatMap((j) => {
      const cell = j === col.value && r.value ? [r.value.value] : (r.cells[j] ?? [])
      return j === col.value && hasCi
        ? [cell, r.value?.ci ? [formatConfidence(r.value.ci)] : []]
        : [cell]
    })
  )
  const heads = order.flatMap((j) =>
    j === col.value && hasCi ? [block.head[j] ?? "", "95% CI"] : [block.head[j] ?? ""]
  )
  const shares = wide ? columnWidths(heads, shown, 880 - 32) : null
  return (
    <TableFrame label={label} className="max-sm:overflow-visible max-sm:bg-none">
      <table role="table" className={cn(TABLE_CLASS, shares && "table-fixed")}>
        {shares ? (
          <colgroup>
            {shares.map((w, i) => (
              // Shares of the table less its copy column (32 of 880 px).
              <col key={i} style={{ width: `${((w * 848) / 880).toFixed(2)}%` }} />
            ))}
            <col style={{ width: "3.64%" }} />
          </colgroup>
        ) : null}
        <TableHeader className="max-sm:sr-only">
          <TableRow role="row" className="hover:bg-transparent">
            {order.map((j) => {
              const h = block.head[j] ?? ""
              const head = (
                <TableHead
                  key={j}
                  role="columnheader"
                  scope="col"
                  numeric={j === col.value}
                  className="h-auto pt-0 whitespace-normal"
                >
                  {typeset(h)}
                </TableHead>
              )
              return j === col.value && hasCi
                ? [
                    head,
                    <TableHead key="ci" role="columnheader" scope="col" numeric>
                      {oneLevel ? `${oneLevel}% CI` : "CI"}
                    </TableHead>,
                  ]
                : head
            })}
            <TableHead role="columnheader" className="px-0">
              <span className="sr-only">Copy</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <MetricRow
              key={i}
              row={row}
              col={col}
              order={order}
              hasCi={hasCi}
              oneLevel={oneLevel}
              pdf={pdf}
              copy={cite(row, col)}
              heads={block.head}
            />
          ))}
        </TableBody>
      </table>
    </TableFrame>
  )
}

function MetricRow({
  row,
  col,
  order,
  hasCi,
  oneLevel,
  pdf,
  copy,
  heads,
}: {
  row: Row
  col: MetricColumns
  order: number[]
  hasCi: boolean
  oneLevel: string | null | undefined
  pdf: string | null
  copy: Citation | null
  heads: readonly string[]
}) {
  const cells = order.flatMap((j) => {
    const cell = row.cells[j] ?? []
    if (j === col.value) {
      const text = row.value?.value ?? plainText(cell)
      const right = startsWithFigure(text)
      const out = [
        <TableCell
          key={j}
          role="cell"
          className={cn(
            "break-words whitespace-normal num max-sm:order-3 max-sm:basis-full max-sm:text-left",
            right ? "text-right" : "text-left"
          )}
        >
          {row.value ? (
            <MetricValueText text={text} />
          ) : (
            <InlineWithPages parts={cell} pdf={pdf} acronyms={false} />
          )}
        </TableCell>,
      ]
      if (hasCi) {
        const ci = row.value?.ci
        out.push(
          <TableCell
            key="ci"
            role="cell"
            className="text-right text-muted-foreground num max-sm:order-4 max-sm:basis-full max-sm:text-left"
          >
            {ci ? (
              <>
                {ci.level !== oneLevel ? <span className="mr-1">{ci.level}%</span> : null}
                <span className="sr-only">{ci.level}% confidence interval </span>
                {typeset(formatConfidence(ci))}
              </>
            ) : null}
          </TableCell>
        )
      }
      return out
    }
    const isMetric = j === col.metric
    return [
      <TableCell
        key={j}
        role="cell"
        data-label={isMetric ? undefined : typeset(heads[j] ?? "")}
        className={cn(
          "break-words whitespace-normal",
          isMetric && "text-foreground max-sm:order-1 max-sm:basis-[calc(100%-3.75rem)]",
          isMetric && row.starred && "font-semibold",
          !isMetric && "max-sm:order-5 max-sm:basis-full max-sm:text-muted-foreground",
          !isMetric &&
            j !== col.condition &&
            "max-sm:before:mr-1.5 max-sm:before:label max-sm:before:content-[attr(data-label)]"
        )}
      >
        {isMetric && row.starred ? <span className="sr-only">Headline: </span> : null}
        <InlineWithPages parts={cell} pdf={pdf} acronyms={false} />
      </TableCell>,
    ]
  })
  return (
    <TableRow
      role="row"
      data-copyable=""
      className="group/copy max-sm:flex max-sm:flex-wrap max-sm:items-baseline max-sm:gap-x-2 max-sm:gap-y-0.5 max-sm:py-2.5 [&>td]:max-sm:px-0 [&>td]:max-sm:py-0"
    >
      {cells}
      <TableCell role="cell" className="px-0 py-1 align-top max-sm:order-2 max-sm:ml-auto">
        {copy ? <CopyCitation citation={copy} what="the metric" /> : null}
      </TableCell>
    </TableRow>
  )
}

/** A value: only its figures bold ("median **44.2%** across days"). */
export function MetricValueText({ text }: { text: string }) {
  return boldFigures(text).map((piece, i) =>
    typeof piece === "string" ? (
      <Typeset key={i} text={piece} />
    ) : (
      <strong key={i} className="font-semibold text-foreground">
        {typeset(piece.number)}
      </strong>
    )
  )
}
