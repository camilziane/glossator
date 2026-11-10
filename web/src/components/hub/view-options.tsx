"use client"

import { type ReactTable } from "@tanstack/react-table"
import { ChevronDownIcon } from "lucide-react"
import { type ComponentProps, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"

import { type HubRow } from "./model"
import { type HubFeatures } from "./table-features"
import { ROW_LINES, ROW_LINES_LABELS, isRowLines, type RowLines } from "./use-row-lines"

/**
 * A text menu's trigger: the word, what is chosen (muted), a small chevron. No icon before the
 * word, no box until hovered: the toolbar reads as a line of words.
 */
export function MenuButton({
  children,
  value,
  className,
  ...props
}: ComponentProps<typeof Button> & { value?: ReactNode }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn("gap-1 px-2 font-medium", className)}
      {...props}
    >
      {children}
      {value !== undefined && value !== null ? (
        <span className="font-normal text-muted-foreground num">{value}</span>
      ) : null}
      <ChevronDownIcon aria-hidden className="size-3.5 text-muted-foreground" />
    </Button>
  )
}

/** "Rows: 1 line · 2 lines · Full": how much of each cell the rows show, in words. */
export function RowsToggle({
  lines,
  onChange,
}: {
  lines: RowLines
  onChange: (lines: RowLines) => void
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span id="hub-rows-label" className="text-small text-muted-foreground">
        Rows
      </span>
      <ToggleGroup
        type="single"
        size="sm"
        spacing={0}
        value={lines}
        onValueChange={(v) => {
          if (isRowLines(v)) onChange(v)
        }}
        aria-labelledby="hub-rows-label"
      >
        {ROW_LINES.map((value) => (
          <ToggleGroupItem key={value} value={value} className="focus-inset">
            {ROW_LINES_LABELS[value]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}

/** Which columns show. The menu stays open while columns are toggled. */
export function ColumnsMenu<R extends HubRow>({ table }: { table: ReactTable<HubFeatures, R> }) {
  const columns = table.getAllLeafColumns().filter((c) => c.getCanHide())
  if (columns.length === 0) return null
  // Columns hidden beyond those hidden until asked for (Tags).
  const hidden = columns.filter((c) => !c.getIsVisible() && !c.columnDef.meta?.defaultHidden).length
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <MenuButton value={hidden ? `${hidden} hidden` : undefined}>Columns</MenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Show columns</DropdownMenuLabel>
        {columns.map((column) => (
          <DropdownMenuCheckboxItem
            key={column.id}
            checked={column.getIsVisible()}
            onCheckedChange={(checked) => column.toggleVisibility(checked)}
            onSelect={(e) => e.preventDefault()}
          >
            <span className="truncate">{column.columnDef.meta?.title ?? column.id}</span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export interface SortChoice {
  readonly value: string
  readonly label: string
}

/** Sorting where there are no column heads (the phone's rows). */
export function SortMenu({
  choices,
  value,
  onChange,
}: {
  choices: readonly SortChoice[]
  value: string
  onChange: (value: string) => void
}) {
  const current = choices.find((c) => c.value === value)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <MenuButton aria-label={`Sort: ${current?.label ?? "by a column"}`}>
          <span className="max-w-36 truncate">{current?.label ?? "Sort"}</span>
        </MenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>Sort by</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {choices.map((choice) => (
            <DropdownMenuRadioItem key={choice.value} value={choice.value}>
              {choice.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
