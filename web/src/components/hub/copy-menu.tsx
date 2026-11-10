"use client"

import { ChevronDownIcon } from "lucide-react"
import { useState } from "react"

import { useCopy } from "@/components/content/copy-button"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { formatCount } from "@/lib/format"
import { cn } from "@/lib/utils"

import {
  EXPORT_FORMATS,
  EXPORT_LABELS,
  exportAs,
  metricsAs,
  type ExportFormat,
  type ExportTable,
  type MetricRow,
} from "./export"

const HINTS: Record<ExportFormat, string> = {
  markdown: "for notes",
  csv: "for a spreadsheet",
  latex: "tabularx, with \\cite",
}

type What = "table" | "metrics"

/**
 * Copy ▾: the rows on screen as a Markdown table, CSV or LaTeX — the table as shown (its visible
 * columns), or its headline metrics (one line per ★ metric: metric, value, CI, condition, page).
 * The trigger says "Copied" for a moment (no toast); screen readers hear what was copied.
 */
export function CopyMenu({
  table,
  metrics,
  rows,
  columns,
}: {
  /** The table to copy, built when chosen (what is on screen then). */
  table: () => ExportTable
  /** The headline metrics of the rows on screen, read when the menu opens. */
  metrics: () => MetricRow[]
  rows: number
  columns: number
}) {
  const { state, copy } = useCopy()
  const [last, setLast] = useState<{ what: What; format: ExportFormat }>({
    what: "table",
    format: "markdown",
  })
  const [count, setCount] = useState(0)
  const table1 = `${formatCount(rows, "row")} × ${formatCount(columns, "column")}`
  const said =
    last.what === "table"
      ? `the ${table1} as a ${EXPORT_LABELS[last.format]}`
      : `the headline metrics as a ${EXPORT_LABELS[last.format]}`
  const choose = (what: What, format: ExportFormat) => {
    setLast({ what, format })
    void copy(what === "table" ? exportAs(format, table()) : metricsAs(format, metrics()))
  }
  return (
    <>
      <DropdownMenu onOpenChange={(open) => open && setCount(metrics().length)}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            data-copy-state={state}
            disabled={rows === 0}
            className={cn("gap-1 px-2", state === "failed" && "text-danger")}
          >
            {/* "Copy" and "Copied" share one cell: the trigger keeps its width. */}
            <span className="inline-grid [&>span]:col-start-1 [&>span]:row-start-1 [&>span]:transition-opacity [&>span]:duration-[120ms]">
              <span className={cn(state !== "idle" && "opacity-0")}>Copy</span>
              <span aria-hidden className={cn(state === "idle" && "opacity-0")}>
                {state === "failed" ? "Not copied" : "Copied"}
              </span>
            </span>
            <ChevronDownIcon aria-hidden className="size-3.5 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="num">The table · {table1}</DropdownMenuLabel>
            {EXPORT_FORMATS.map((format) => (
              <Item key={format} what="table" format={format} onChoose={choose} />
            ))}
          </DropdownMenuGroup>
          {count > 0 ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel className="num">
                  Headline metrics · {formatCount(count, "row")}
                </DropdownMenuLabel>
                {EXPORT_FORMATS.map((format) => (
                  <Item key={format} what="metrics" format={format} onChoose={choose} />
                ))}
              </DropdownMenuGroup>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <span role="status" className="sr-only">
        {state === "copied"
          ? `Copied ${said}`
          : state === "failed"
            ? "Could not copy: the browser refused"
            : ""}
      </span>
    </>
  )
}

function Item({
  what,
  format,
  onChoose,
}: {
  what: What
  format: ExportFormat
  onChoose: (what: What, format: ExportFormat) => void
}) {
  return (
    <DropdownMenuItem
      onSelect={() => onChoose(what, format)}
      aria-label={`${what === "table" ? "The table" : "The headline metrics"} as ${EXPORT_LABELS[format]}`}
      className="justify-between gap-4"
    >
      <span>{EXPORT_LABELS[format]}</span>
      <span className="text-small text-muted-foreground">{HINTS[format]}</span>
    </DropdownMenuItem>
  )
}
