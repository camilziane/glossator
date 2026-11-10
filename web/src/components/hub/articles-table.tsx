"use client"

import {
  functionalUpdate,
  useTable,
  type ColumnFiltersState,
  type ColumnVisibilityState,
  type SortingState,
  type Updater,
} from "@tanstack/react-table"
import { useRouter } from "next/navigation"
import { useQueryStates } from "nuqs"
import { useDeferredValue, useEffect, useRef, useState, type KeyboardEvent } from "react"

import { CliCommand } from "@/components/content/cli-command"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { useEntryFocus } from "@/hooks/use-entry-focus"
import { rememberListOrder, useFromHere, useListMemory } from "@/hooks/use-list-memory"
import { useIsMobile } from "@/hooks/use-mobile"
import { type Bibliography } from "@/lib/data"
import { routes } from "@/lib/routes"
import { commands } from "@/lib/site"

import { articleColumns, SEARCH_COLUMN } from "./columns"
import { CopyMenu } from "./copy-menu"
import { attr, HubDataTable, rowElement } from "./data-table"
import { exportTable, headlineMetrics, type ExportColumn } from "./export"
import { FilterInput } from "./filter-input"
import { FilterLine } from "./filter-line"
import { type ArticleRow, type HubModel, type NoticeLevel } from "./model"
import { PhoneArticle, PhoneRows } from "./phone-rows"
import { Preview } from "./preview"
import { previewOf } from "./preview-model"
import { hubFeatures, tokensFilter, type TagChoice } from "./table-features"
import { tagCounts, TagsMenu } from "./tags-menu"
import {
  ARTICLE_TABLE_OPTIONS,
  articleTableParams,
  DEFAULT_SORT,
  isColumnVisible,
  typingOptions,
  type YearRange,
} from "./url-state"
import { useRowLines } from "./use-row-lines"
import { ColumnsMenu, RowsToggle, SortMenu, type SortChoice } from "./view-options"
import { YearFilter } from "./year-filter"

type FacetId = "tags" | "status" | "notice" | "year"

/**
 * The Articles table of a bibliography: one toolbar row (the filter, Tags, Year; Rows, Columns,
 * Copy), the filters said in words under it, the table (a list of compact rows on phones) and the
 * preview drawer. Its filters and sort are in the URL; its current row and scroll come back on
 * Back; its links carry the list (`from`), whose order it remembers, so an article pages within it.
 */
export function ArticlesTable({ bib, model }: { bib: Bibliography; model: HubModel }) {
  const router = useRouter()
  const isMobile = useIsMobile()
  const [lines, setLines] = useRowLines(bib.name, model.articles.rows.length)
  // The controls follow the URL at once; the table (every cell) follows a deferred copy, so a key
  // press or a click never waits for it.
  const [urlParams, setParams] = useQueryStates(articleTableParams, ARTICLE_TABLE_OPTIONS)
  const params = useDeferredValue(urlParams)
  const table = model.articles
  const columns = articleColumns(model)
  const from = useFromHere()

  const sortable = new Set(columns.filter((c) => c.enableSorting !== false).map((c) => c.id))
  const sort = sortable.has(params.sort.id) ? params.sort : DEFAULT_SORT
  const sorting: SortingState = [{ id: sort.id, desc: sort.desc }]

  const tagChoice: TagChoice = { tags: params.tag, mode: params.tagmode }
  const columnFilters: ColumnFiltersState = [
    ...(params.tag.length ? [{ id: "tags", value: tagChoice }] : []),
    ...(params.status.length ? [{ id: "status", value: params.status }] : []),
    ...(params.notice.length ? [{ id: "notice", value: params.notice }] : []),
    ...(params.year ? [{ id: "year", value: params.year }] : []),
  ]

  const columnVisibility: ColumnVisibilityState = Object.fromEntries(
    columns.map((c) => {
      const meta = c.meta
      const id = c.id ?? ""
      if (!meta || meta.kind === "hidden") return [id, false]
      return [id, isColumnVisible(id, !!meta.defaultHidden, params.cols)]
    })
  )

  const onSortingChange = (updater: Updater<SortingState>) => {
    const next = functionalUpdate(updater, sorting)[0]
    void setParams({ sort: next ? { id: next.id, desc: next.desc } : null })
  }

  const onColumnFiltersChange = (updater: Updater<ColumnFiltersState>) => {
    const next = functionalUpdate(updater, columnFilters)
    const value = (id: FacetId) => next.find((f) => f.id === id)?.value
    void setParams({
      tag: (value("tags") as TagChoice | undefined)?.tags.slice() ?? null,
      status: (value("status") as string[] | undefined) ?? null,
      notice: (value("notice") as NoticeLevel[] | undefined) ?? null,
      year: (value("year") as YearRange | undefined) ?? null,
    })
  }

  const onColumnVisibilityChange = (updater: Updater<ColumnVisibilityState>) => {
    const next = functionalUpdate(updater, columnVisibility)
    const toggled = columns
      .filter((c) => c.meta && c.meta.kind !== "hidden")
      .filter((c) => (next[c.id ?? ""] !== false) === !!c.meta?.defaultHidden)
      .map((c) => c.id ?? "")
    void setParams({ cols: toggled.length ? toggled : null })
  }

  const reactTable = useTable({
    features: hubFeatures,
    columns,
    data: table.rows,
    getRowId: (row) => row.ref,
    state: { sorting, columnFilters, globalFilter: params.q, columnVisibility },
    onSortingChange,
    onColumnFiltersChange,
    onGlobalFilterChange: (updater: Updater<string>) =>
      void setParams({ q: functionalUpdate(updater, urlParams.q) || null }),
    onColumnVisibilityChange,
    globalFilterFn: tokensFilter,
    getColumnCanGlobalFilter: (column) => column.id === SEARCH_COLUMN,
    enableSortingRemoval: false,
    enableMultiSort: false,
  })

  const rows = reactTable.getRowModel().rows
  const total = table.rows.length

  // ---- the current row: remembered per list, back on a return, focused on arrival
  const memory = useListMemory()
  const [current, setCurrentState] = useState<string | null>(() => memory.restored?.row ?? null)
  const setCurrent = (id: string) => {
    if (id === current) return
    setCurrentState(id)
    memory.remember(id)
  }
  const bodyRef = useRef<HTMLTableSectionElement | null>(null)
  const listRef = useRef<HTMLUListElement | null>(null)
  const stop =
    current !== null && rows.some((r) => r.id === current) ? current : (rows[0]?.id ?? null)
  // On phones the page's h1 takes the focus on arrival (no keys there; a ring on a title is noise).
  const rowTarget = (id: string | null): HTMLElement | null =>
    isMobile
      ? (listRef.current?.querySelector<HTMLElement>(
          `li[data-row-id="${attr(id ?? "")}"] [data-row-title]`
        ) ?? null)
      : rowElement(bodyRef.current, id)
  useEntryFocus(() => (isMobile ? null : rowTarget(stop)), { ready: rows.length > 0 })

  // The order on screen, for the article's pager (`[` `]` within this list).
  const order = rows.flatMap((r) => (r.original.key ? [r.original.ref] : [])).join("\n")
  useEffect(() => {
    if (from) rememberListOrder(from, order ? order.split("\n") : [])
  }, [from, order])

  // ---- the preview
  const [previewOpen, setPreviewOpen] = useState(false)
  const [citeOpen, setCiteOpen] = useState(false)
  const firstControl = useRef<HTMLAnchorElement | null>(null)
  const keepOpenWithin = useRef<HTMLDivElement | null>(null)
  const previewRow = previewOpen ? (rows.find((r) => r.id === stop)?.original ?? null) : null

  const openRow = (row: ArticleRow, newTab: boolean) => {
    if (!row.key) return
    const href = routes.article(bib.name, row.key, undefined, { from })
    setCurrent(row.ref)
    if (newTab) window.open(href, "_blank", "noopener")
    else router.push(href)
  }
  // The row that was current when the pointer went down: a click focuses its row first (the
  // preview follows it), so the click toggles the preview only on the row it already showed.
  const pressedOn = useRef<{ row: string | null; at: number } | null>(null)
  const previewRowOf = (row: ArticleRow) => {
    const pressed = pressedOn.current
    pressedOn.current = null
    const shown = pressed && performance.now() - pressed.at < 1000 ? pressed.row : stop
    if (previewOpen && shown === row.ref) {
      setPreviewOpen(false)
      return
    }
    setCurrent(row.ref)
    setPreviewOpen(true)
  }
  const onRowKey = (event: KeyboardEvent<HTMLElement>, row: ArticleRow): boolean => {
    if (event.key === "Tab" && !event.shiftKey && previewOpen && firstControl.current) {
      firstControl.current.focus()
      return true
    }
    if (event.shiftKey || event.repeat) return false
    switch (event.key) {
      case "p": {
        const pdf = row.article ? previewOf(row.article).pdf : null
        if (!pdf) return false
        window.open(pdf, "_blank", "noopener")
        return true
      }
      case "c":
        if (!row.article) return false
        setCurrent(row.ref)
        setPreviewOpen(true)
        setCiteOpen(true)
        return true
      default:
        return false
    }
  }

  if (total === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No article yet</EmptyTitle>
          <EmptyDescription>Curate a first one from its DOI:</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <CliCommand command={commands.curate(bib.name)} />
        </EmptyContent>
      </Empty>
    )
  }

  const filtered =
    urlParams.q.trim() !== "" ||
    urlParams.tag.length > 0 ||
    urlParams.status.length > 0 ||
    urlParams.notice.length > 0 ||
    urlParams.year !== null
  const reset = () =>
    void setParams({ q: null, tag: null, tagmode: null, status: null, notice: null, year: null })

  const noMatch = (
    <Empty className="py-8">
      <EmptyHeader>
        <EmptyTitle>No article matches</EmptyTitle>
        <EmptyDescription>
          {params.q.trim() ? (
            <>
              Nothing in this bibliography’s tables or cards has every word of “{params.q.trim()}”
              {columnFilters.length ? " under these filters" : ""}.
            </>
          ) : params.tag.length > 1 && params.tagmode === "all" ? (
            <>No article has all these tags: ask for any of them, or fewer.</>
          ) : (
            <>No article has every value these filters ask for.</>
          )}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button size="sm" onClick={reset}>
          Clear the filters
        </Button>
      </EmptyContent>
    </Empty>
  )

  const facetRows = reactTable.getColumn("tags")?.getFacetedRowModel().rows ?? []
  const counts = tagCounts(
    facetRows.map((r) => r.original),
    urlParams.tag,
    urlParams.tagmode
  )

  const visible = reactTable.getVisibleLeafColumns()
  const indexOf = new Map(table.columns.map((c) => [c.id, c.index]))
  const exportColumns: ExportColumn[] = visible.map((c) => {
    const meta = c.columnDef.meta
    const kind =
      meta?.kind === "article" || meta?.kind === "year" || meta?.kind === "tags"
        ? meta.kind
        : "text"
    return { title: meta?.title ?? c.id, kind, index: indexOf.get(c.id), numeric: meta?.numeric }
  })

  const articleColumn = columns[0]?.id ?? "article"
  const sortChoices: SortChoice[] = [
    { value: "year.desc", label: "Newest first" },
    { value: "year.asc", label: "Oldest first" },
    { value: `${articleColumn}.asc`, label: "Citation, A to Z" },
    { value: `${articleColumn}.desc`, label: "Citation, Z to A" },
  ]
  const keyColumn = model.metricsColumn
    ? (indexOf.get(model.metricsColumn) ?? null)
    : (table.columns[1]?.index ?? null)
  const label = `Articles of ${bib.title}`

  return (
    <div className="flex flex-col gap-3">
      <div data-print="hide" className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <FilterInput
          value={urlParams.q}
          onChange={(q) => void setParams({ q: q || null }, typingOptions(q))}
          label="Filter the articles"
          placeholder="Filter articles"
          className="w-full md:w-60"
        />
        <div className="flex items-center gap-0.5">
          {model.facets.tags.length > 1 ? (
            <TagsMenu
              groups={model.tagGroups}
              selected={urlParams.tag}
              mode={urlParams.tagmode}
              counts={counts}
              onChange={(tag) => void setParams({ tag: tag.length ? tag : null })}
              onModeChange={(tagmode) => void setParams({ tagmode })}
            />
          ) : null}
          {model.facets.years && model.facets.years[0] < model.facets.years[1] ? (
            <YearFilter
              bounds={model.facets.years}
              histogram={model.facets.perYear}
              value={urlParams.year}
              onChange={(year) => void setParams({ year })}
            />
          ) : null}
          {isMobile && total > 1 ? (
            <SortMenu
              choices={sortChoices}
              value={`${sort.id}.${sort.desc ? "desc" : "asc"}`}
              onChange={(v) => {
                const [id = "year", dir] = v.split(".")
                void setParams({ sort: { id, desc: dir === "desc" } })
              }}
            />
          ) : null}
        </div>
        {/* Phones show compact rows: their height, columns and copies are a desktop matter. */}
        <div className="ml-auto flex items-center gap-4 max-md:hidden">
          <RowsToggle lines={lines} onChange={setLines} />
          <div className="flex items-center gap-0.5">
            <ColumnsMenu table={reactTable} />
            <CopyMenu
              table={() =>
                exportTable(
                  exportColumns,
                  rows.map((r) => r.original)
                )
              }
              metrics={() => headlineMetrics(rows.map((r) => r.original))}
              rows={rows.length}
              columns={exportColumns.length}
            />
          </div>
        </div>
      </div>
      <FilterLine
        shown={rows.length}
        total={total}
        filtered={filtered}
        params={urlParams}
        onChange={(change) => void setParams(change)}
        onReset={reset}
      />
      <div
        ref={keepOpenWithin}
        onPointerDownCapture={() => {
          pressedOn.current = { row: stop, at: performance.now() }
        }}
      >
        {isMobile ? (
          <PhoneRows
            table={reactTable}
            label={label}
            listRef={listRef}
            onCurrentChange={setCurrent}
            onPreviewRow={previewRowOf}
            previewing={previewOpen ? stop : null}
            renderRow={(row) => <PhoneArticle row={row.original} keyColumn={keyColumn} />}
            empty={noMatch}
          />
        ) : (
          <HubDataTable
            table={reactTable}
            label={label}
            lines={lines}
            current={stop}
            onCurrentChange={setCurrent}
            onOpenRow={openRow}
            onPreviewRow={previewRowOf}
            previewing={previewOpen ? stop : null}
            onRowKey={onRowKey}
            rowKeys="Enter Space p c"
            bodyRef={bodyRef}
            empty={noMatch}
          />
        )}
      </div>
      <Preview
        row={previewRow}
        open={previewOpen}
        onOpenChange={(open) => {
          setPreviewOpen(open)
          if (!open) setCiteOpen(false)
        }}
        side={isMobile ? "bottom" : "right"}
        bib={bib.name}
        from={from}
        citeOpen={citeOpen}
        onCiteOpenChange={setCiteOpen}
        keepOpenWithin={keepOpenWithin}
        firstControl={firstControl}
        onClosed={() => {
          // Esc keeps the row: the focus goes back to it when it was in the drawer (now gone), not
          // when the reader has put it somewhere (a row, the toolbar).
          const active = document.activeElement
          if (active && active !== document.body) return
          rowTarget(stop)?.focus({ preventScroll: true })
        }}
      />
    </div>
  )
}
