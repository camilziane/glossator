/**
 * Column definitions of the hub's tables, built once per table model: the data's own columns (drawn
 * from their inline parts, sorted on their plain text), plus, for Articles, Year, Tags and the
 * columns the filters read (status, notice, search) that never show.
 */
import { createColumnHelper, type ColumnDef, type Row } from "@tanstack/react-table"

import { ArticleCell, EntryCell, MetricCell, TagsCell, TextCell, YearCell } from "./cells"
import {
  compareText,
  type ArticleRow,
  type HubModel,
  type HubRow,
  type HubTableModel,
} from "./model"
import {
  oneOfFilter,
  tagsFilter,
  tokensFilter,
  yearRangeFilter,
  type HubFeatures,
} from "./table-features"

export type HubColumnDef<R extends HubRow> = ColumnDef<HubFeatures, R, unknown>

/** Plain text, empty cells last in either direction (their value is undefined). */
function textValue(text: string): string | undefined {
  return text === "" ? undefined : text
}

function byText<R extends HubRow>(a: Row<HubFeatures, R>, b: Row<HubFeatures, R>, id: string) {
  return compareText(a.getValue<string>(id), b.getValue<string>(id))
}

function byNumber<R extends HubRow>(a: Row<HubFeatures, R>, b: Row<HubFeatures, R>, id: string) {
  return a.getValue<number>(id) - b.getValue<number>(id)
}

/** The column the filter box reads (every word of the query must occur in the row). */
export const SEARCH_COLUMN = "search"

function searchColumn<R extends HubRow>(): HubColumnDef<R> {
  const helper = createColumnHelper<HubFeatures, R>()
  return helper.accessor((row) => row.haystack, {
    id: SEARCH_COLUMN,
    enableSorting: false,
    enableHiding: false,
    filterFn: tokensFilter,
    meta: { title: "Search", min: 0, ideal: 0, kind: "hidden" },
  }) as HubColumnDef<R>
}

const articleCache = new WeakMap<HubModel, HubColumnDef<ArticleRow>[]>()

/** Whether a column holds only figures ("12", "0.71", "88 %"): right-aligned, tabular. */
export function isNumericColumn(text: readonly string[]): boolean {
  const filled = text.filter((t) => t.trim() !== "")
  return filled.length > 0 && filled.every((t) => /^[-−+±~≈]?\s?[\d.,\s]+\s?%?$/u.test(t.trim()))
}

export function articleColumns(hub: HubModel): HubColumnDef<ArticleRow>[] {
  const cached = articleCache.get(hub)
  if (cached) return cached
  const model = hub.articles
  const helper = createColumnHelper<HubFeatures, ArticleRow>()
  const [first, ...rest] = model.columns
  const columns: HubColumnDef<ArticleRow>[] = []
  if (first) {
    columns.push(
      helper.accessor((row) => textValue(row.cite), {
        id: first.id,
        header: first.title,
        cell: ({ row }) => <ArticleCell row={row.original} />,
        sortFn: byText,
        sortUndefined: "last",
        enableHiding: false,
        meta: {
          title: first.title,
          min: first.min,
          ideal: first.ideal,
          kind: "article",
          pin: "left",
        },
      }) as HubColumnDef<ArticleRow>
    )
  }
  columns.push(
    helper.accessor((row) => row.year ?? undefined, {
      id: "year",
      header: "Year",
      cell: ({ row }) => <YearCell year={row.original.year} />,
      sortFn: byNumber,
      sortUndefined: "last",
      sortDescFirst: true,
      filterFn: yearRangeFilter,
      meta: { title: "Year", min: 5, ideal: 5, kind: "year", numeric: true },
    }) as HubColumnDef<ArticleRow>
  )
  for (const col of rest) {
    const numeric = isNumericColumn(model.rows.map((r) => r.text[col.index] ?? ""))
    const metrics = col.id === hub.metricsColumn
    columns.push(
      helper.accessor((row) => textValue(row.text[col.index] ?? ""), {
        id: col.id,
        header: col.title,
        cell: ({ row }) =>
          metrics ? (
            <MetricCell parts={row.original.cells[col.index] ?? []} />
          ) : (
            <TextCell parts={row.original.cells[col.index] ?? []} />
          ),
        sortFn: byText,
        sortUndefined: "last",
        // Key metrics mix kinds of figures (accuracy, error rates, correlations): no order holds.
        enableSorting: !metrics,
        meta: {
          title: col.title,
          // Key metrics are never cut (but on one-line rows): they take the room the others give.
          min: metrics ? Math.max(col.min, 14) : col.min,
          ideal: metrics ? 30 : Math.min(col.ideal, 16),
          kind: "text",
          numeric,
          pin: metrics ? "right" : undefined,
        },
      }) as HubColumnDef<ArticleRow>
    )
  }
  columns.push(
    helper.accessor((row) => row.tags, {
      id: "tags",
      header: "Tags",
      cell: ({ row }) => <TagsCell tags={row.original.tags} />,
      getUniqueValues: (row) => row.tags,
      enableSorting: false,
      filterFn: tagsFilter,
      meta: { title: "Tags", min: 9, ideal: 14, kind: "tags", defaultHidden: true },
    }) as HubColumnDef<ArticleRow>,
    helper.accessor((row) => row.status, {
      id: "status",
      enableSorting: false,
      enableHiding: false,
      filterFn: oneOfFilter,
      meta: { title: "Status", min: 0, ideal: 0, kind: "hidden", defaultHidden: true },
    }) as HubColumnDef<ArticleRow>,
    helper.accessor((row) => row.notice, {
      id: "notice",
      enableSorting: false,
      enableHiding: false,
      filterFn: oneOfFilter,
      meta: { title: "Notices", min: 0, ideal: 0, kind: "hidden", defaultHidden: true },
    }) as HubColumnDef<ArticleRow>,
    searchColumn<ArticleRow>()
  )
  articleCache.set(hub, columns)
  return columns
}

const otherCache = new WeakMap<HubTableModel, HubColumnDef<HubRow>[]>()

/** An id: one word of letters and figures with a figure in it, maybe hyphenated ("P1", "S12-B4-a"). */
const ID = /^(?=\S*\d)[\p{L}\p{N}]+(?:[-_.][\p{L}\p{N}]+)*$/u

/**
 * A table whose rows are named by ids (plots, sites, samples: "P1", "S12-B4-a"), not by words that
 * may be tags of the Articles: its first column breaks them only after their hyphens.
 */
export function isIdTable(model: HubTableModel): boolean {
  const first = model.rows.map((r) => (r.text[0] ?? "").trim())
  return first.length > 0 && first.every((text) => ID.test(text))
}

/**
 * A table of the hub other than Articles (Plots, Sensor types, Kinds): its own columns.
 * The first names the row (an id, a type that may be a tag of the Articles); it stays in view.
 */
export function otherColumns(model: HubTableModel): HubColumnDef<HubRow>[] {
  const cached = otherCache.get(model)
  if (cached) return cached
  const helper = createColumnHelper<HubFeatures, HubRow>()
  const ids = isIdTable(model)
  // An id breaks only after its hyphens: its column is as wide as its longest part.
  const longestPart = ids
    ? Math.max(
        0,
        ...model.rows.flatMap((r) => (r.text[0] ?? "").split(/(?<=-)/).map((p) => p.length))
      )
    : 0
  const longestId = ids ? Math.max(0, ...model.rows.map((r) => (r.text[0] ?? "").length)) : 0
  const columns: HubColumnDef<HubRow>[] = model.columns.map(
    (col) =>
      helper.accessor((row) => textValue(row.text[col.index] ?? ""), {
        id: col.id,
        header: col.title,
        cell: ({ row }) => {
          const parts = row.original.cells[col.index] ?? []
          if (col.index !== 0) return <TextCell parts={parts} />
          return ids ? <TextCell parts={parts} ids /> : <EntryCell parts={parts} />
        },
        sortFn: byText,
        sortUndefined: "last",
        enableHiding: col.index !== 0,
        meta: {
          title: col.title,
          min:
            col.index !== 0
              ? col.min
              : ids
                ? Math.max(7, longestPart * 0.52 + 1.5)
                : Math.min(col.min, 10),
          ideal:
            col.index !== 0
              ? col.ideal
              : ids
                ? Math.min(14, Math.max(7, longestPart * 0.52 + 1.5, longestId * 0.5 + 1.5))
                : Math.min(col.ideal, 12),
          kind: col.index === 0 ? "article" : "text",
          numeric:
            col.index !== 0 && isNumericColumn(model.rows.map((r) => r.text[col.index] ?? "")),
          pin: col.index === 0 ? "left" : undefined,
          ids: col.index === 0 && ids,
        },
      }) as HubColumnDef<HubRow>
  )
  columns.push(searchColumn<HubRow>())
  otherCache.set(model, columns)
  return columns
}
