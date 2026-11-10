import * as React from "react"
import { cn } from "@/lib/utils"

/*
 * A table of data: the sans at 13.5/19 and 92 % width, heads as labels over an ink rule, rows on
 * hairlines (never zebra), numbers right-aligned in tabular figures (`<TableCell numeric>`). A table
 * wider than its column scrolls sideways and says so with shadows at its edges (`scroll-shadow`).
 */
function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div data-slot="table-container" className="scroll-shadow relative w-full">
      <table
        data-slot="table"
        className={cn(
          "w-full caption-bottom border-collapse font-sans text-table [font-stretch:92%]",
          className
        )}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b [&_tr]:border-foreground", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-b-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn("border-t border-foreground font-medium [&>tr]:last:border-b-0", className)}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b border-border transition-colors duration-150 hover:bg-muted data-[state=selected]:bg-muted",
        className
      )}
      {...props}
    />
  )
}

function TableHead({
  className,
  numeric,
  ...props
}: React.ComponentProps<"th"> & {
  /** A column of numbers: the head aligns right, over its figures. */
  numeric?: boolean
}) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "label h-9 px-2.5 pb-1.5 text-left align-bottom whitespace-nowrap first:pl-0 last:pr-0 [&:has([role=checkbox])]:pr-0",
        numeric && "text-right",
        className
      )}
      {...props}
    />
  )
}

function TableCell({
  className,
  numeric,
  ...props
}: React.ComponentProps<"td"> & {
  /** A number: right-aligned, lining tabular figures, never broken. */
  numeric?: boolean
}) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "px-2.5 py-2 align-top first:pl-0 last:pr-0 [&:has([role=checkbox])]:pr-0",
        numeric && "num text-right whitespace-nowrap",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("gloss mt-3 text-left", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
