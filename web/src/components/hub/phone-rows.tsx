"use client"

import { type ReactTable, type Row } from "@tanstack/react-table"
import Link from "next/link"
import { useRef, type MouseEvent, type ReactNode, type RefObject } from "react"

import { CiteLine } from "@/components/content/cite"
import { DraftBadge, NoticeBadges } from "@/components/content/notice-badge"
import { Typeset } from "@/components/content/typeset"
import { guessLang } from "@/lib/lang"
import { routes } from "@/lib/routes"
import { cn } from "@/lib/utils"

import { Clamp, MetricText } from "./cells"
import { useClampMeasure } from "./clamp-measure"
import { RowLinesContext, useHubLinks } from "./hub-context"
import { type ArticleRow, type HubRow } from "./model"
import { type HubFeatures } from "./table-features"

const INTERACTIVE = "a, button, input, select, textarea, label, summary, [role=button]"

/**
 * A hub table on phones: compact rows instead of a squeezed table, one after the other on
 * hairlines. A tap on a row (outside its link) previews it; `renderRow` draws what a row says.
 */
export function PhoneRows<R extends HubRow>({
  table,
  label,
  onCurrentChange,
  onPreviewRow,
  previewing,
  renderRow,
  empty,
  listRef,
}: {
  table: ReactTable<HubFeatures, R>
  label: string
  onCurrentChange: (id: string) => void
  onPreviewRow?: (row: R) => void
  previewing?: string | null
  renderRow: (row: Row<HubFeatures, R>) => ReactNode
  empty: ReactNode
  listRef?: RefObject<HTMLUListElement | null>
}) {
  const rows = table.getRowModel().rows
  const ownRef = useRef<HTMLUListElement | null>(null)
  const ref = listRef ?? ownRef
  useClampMeasure(ref, [rows.map((r) => r.id).join("|")])
  if (rows.length === 0) return <div className="border-t border-border">{empty}</div>
  const onClick = (event: MouseEvent<HTMLElement>, row: R) => {
    if ((event.target as Element).closest(INTERACTIVE)) return
    if (window.getSelection()?.toString()) return
    onPreviewRow?.(row)
  }
  return (
    <RowLinesContext value="2">
      <ul ref={ref} aria-label={label} className="border-t border-border">
        {rows.map((row) => (
          <li
            key={row.id}
            data-row-id={row.id}
            data-touch-row={onPreviewRow ? "" : undefined}
            data-previewing={row.id === previewing || undefined}
            onClick={(e) => onClick(e, row.original)}
            onFocus={() => onCurrentChange(row.id)}
            className={cn(
              "-mx-4 border-b border-border px-4 py-3 transition-colors duration-150 data-[previewing]:bg-muted",
              onPreviewRow && "cursor-default"
            )}
          >
            {renderRow(row)}
          </li>
        ))}
      </ul>
    </RowLinesContext>
  )
}

/** An article on a phone: its title (the link), its citation, one key value. */
export function PhoneArticle({ row, keyColumn }: { row: ArticleRow; keyColumn: number | null }) {
  const { bib, from } = useHubLinks()
  const href = row.key ? routes.article(bib, row.key, undefined, { from }) : null
  const lang = guessLang(row.title)
  const value = keyColumn === null ? [] : (row.cells[keyColumn] ?? [])
  const name = (
    <>
      <span className="block font-serif text-item font-semibold text-pretty text-foreground [font-variant-numeric:lining-nums_proportional-nums]">
        <Typeset text={row.title} lang={lang} acronyms />
      </span>
      <span className="mt-0.5 block font-serif text-small text-muted-foreground [font-variant-numeric:oldstyle-nums_proportional-nums]">
        {row.article ? <CiteLine card={row.article} /> : row.cite}
        {row.notices.length ? (
          <>
            {" "}
            <NoticeBadges notices={row.notices} />
          </>
        ) : null}
        {row.status === "draft" ? (
          <>
            {" "}
            <DraftBadge />
          </>
        ) : null}
      </span>
    </>
  )
  return (
    <>
      {/* The title and its citation open the article; a tap on the rest previews it. */}
      {href ? (
        <Link href={href} data-row-title className="block">
          {name}
        </Link>
      ) : (
        name
      )}
      {value.length ? (
        <Clamp focusable={false} className="mt-1 font-sans text-table [font-stretch:92%]">
          <MetricText parts={value} />
        </Clamp>
      ) : null}
    </>
  )
}

/** A row of a second table on a phone: its first cell, then its other cells, two lines each. */
export function PhoneEntry<R extends HubRow>({
  table,
  row,
}: {
  table: ReactTable<HubFeatures, R>
  row: Row<HubFeatures, R>
}) {
  const cells = row.getVisibleCells()
  const [head, ...rest] = cells
  return (
    <>
      {head ? (
        <div className="font-medium">
          <table.FlexRender cell={head} />
        </div>
      ) : null}
      {rest.slice(0, 3).map((cell) => (
        <div
          key={cell.id}
          className="mt-1 grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 font-sans text-table [font-stretch:92%]"
        >
          <span className="label">{cell.column.columnDef.meta?.title ?? cell.column.id}</span>
          <table.FlexRender cell={cell} />
        </div>
      ))}
    </>
  )
}
