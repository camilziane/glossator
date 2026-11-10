"use client"

import {
  functionalUpdate,
  useTable,
  type ColumnVisibilityState,
  type SortingState,
  type Updater,
} from "@tanstack/react-table"
import { useDeferredValue, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { useEntryFocus } from "@/hooks/use-entry-focus"
import { useIsMobile } from "@/hooks/use-mobile"
import { formatCount, formatNumber } from "@/lib/format"

import { otherColumns, SEARCH_COLUMN } from "./columns"
import { HubDataTable, rowElement } from "./data-table"
import { FilterInput } from "./filter-input"
import { useHubLinks } from "./hub-context"
import { type HubTableModel } from "./model"
import { PhoneEntry, PhoneRows } from "./phone-rows"
import { hubFeatures, tokensFilter } from "./table-features"
import { useRowLines } from "./use-row-lines"
import { ColumnsMenu, RowsToggle } from "./view-options"

/** "97 plots", "1 row" (a table's title is a plural noun). */
function rowCount(n: number, plural: string): string {
  return n === 1 ? formatCount(1, "row") : `${formatNumber(n)} ${plural}`
}

/**
 * A table of the hub other than Articles (Plots, Sensor types, Kinds): a filter field,
 * sortable columns (data order by default), Rows and Columns. Its links lead to the articles; an
 * entry that is one of the bibliography's tags filters the Articles by it.
 */
export function OtherTable({ model, bibTitle }: { model: HubTableModel; bibTitle: string }) {
  const isMobile = useIsMobile()
  const { bib } = useHubLinks()
  const [lines, setLines] = useRowLines(`${bib}/${model.id}`, model.rows.length)
  const [query, setQuery] = useState("")
  const deferredQuery = useDeferredValue(query)
  const [sorting, setSorting] = useState<SortingState>([])
  const [visibility, setVisibility] = useState<ColumnVisibilityState>({ [SEARCH_COLUMN]: false })
  const [current, setCurrent] = useState<string | null>(null)
  const bodyRef = useRef<HTMLTableSectionElement | null>(null)
  const columns = otherColumns(model)

  const table = useTable({
    features: hubFeatures,
    columns,
    data: model.rows,
    getRowId: (row) => row.id,
    state: { sorting, globalFilter: deferredQuery, columnVisibility: visibility },
    onSortingChange: setSorting,
    onGlobalFilterChange: (updater: Updater<string>) => setQuery(functionalUpdate(updater, query)),
    onColumnVisibilityChange: setVisibility,
    globalFilterFn: tokensFilter,
    getColumnCanGlobalFilter: (column) => column.id === SEARCH_COLUMN,
    enableMultiSort: false,
  })

  const total = model.rows.length
  const rows = table.getRowModel().rows
  const noun = model.title.toLowerCase()
  const stop =
    current !== null && rows.some((r) => r.id === current) ? current : (rows[0]?.id ?? null)
  useEntryFocus(() => (isMobile ? null : rowElement(bodyRef.current, stop)), {
    ready: rows.length > 0,
  })

  if (total === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No {noun} yet</EmptyTitle>
          <EmptyDescription>This table fills in as articles are curated.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const noMatch = (
    <Empty className="py-8">
      <EmptyHeader>
        <EmptyTitle>Nothing matches “{query.trim()}”</EmptyTitle>
        <EmptyDescription>No row of {model.title} has every word of the filter.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button size="sm" onClick={() => setQuery("")}>
          Clear the filter
        </Button>
      </EmptyContent>
    </Empty>
  )

  const label = `${model.title} of ${bibTitle}`

  return (
    <div className="flex flex-col gap-3">
      <div data-print="hide" className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <FilterInput
          value={query}
          onChange={setQuery}
          label={`Filter ${noun}`}
          placeholder={`Filter ${noun}`}
          className="w-full md:w-60"
        />
        <p role="status" aria-live="polite" className="text-small text-muted-foreground num">
          {deferredQuery.trim() ? (
            <>
              <span className="font-medium text-foreground">{formatNumber(rows.length)}</span> of{" "}
              {formatNumber(total)}
            </>
          ) : (
            rowCount(total, noun)
          )}
        </p>
        <div className="ml-auto flex items-center gap-4 max-md:hidden">
          <RowsToggle lines={lines} onChange={setLines} />
          <ColumnsMenu table={table} />
        </div>
      </div>
      {isMobile ? (
        <PhoneRows
          table={table}
          label={label}
          onCurrentChange={setCurrent}
          renderRow={(row) => <PhoneEntry table={table} row={row} />}
          empty={noMatch}
        />
      ) : (
        <HubDataTable
          table={table}
          label={label}
          lines={lines}
          current={stop}
          onCurrentChange={setCurrent}
          bodyRef={bodyRef}
          empty={noMatch}
        />
      )}
    </div>
  )
}
