"use client"

import { ChevronDownIcon, XIcon } from "lucide-react"
import type { MouseEvent, ReactNode, RefObject } from "react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Kbd } from "@/components/ui/kbd"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { formatNumber } from "@/lib/format"
import {
  INBOX_VIEW_LABELS,
  INBOX_VIEWS,
  type InboxView,
  type InboxViewCounts,
} from "@/lib/inbox-views"
import { cn } from "@/lib/utils"

import { SORT_KEYS, SORT_LABELS, SORT_PHRASES, type Facet, type SortKey } from "./inbox-model"
import { Count } from "./paper-parts"

export interface FacetSpec {
  facet: Facet
  /** The menu's name: "Bibliography". */
  label: string
  options: { value: string; label: string; count: number }[]
  chosen: readonly string[]
  /** Its key (`b`), named on the trigger. */
  keyHint?: string
}

// ---------------------------------------------------------------------------- the views

/** The views as text tabs with their counts in fixed slots (New's count in rubric). */
export function ViewTabs({
  view,
  counts,
  maxCount,
  hrefOf,
  onView,
}: {
  view: InboxView
  counts: InboxViewCounts
  maxCount: number
  hrefOf: (view: InboxView) => string
  onView: (view: InboxView) => void
}) {
  return (
    <nav aria-label="Views" className="-mb-px">
      <ul className="flex flex-wrap items-stretch gap-x-6">
        {INBOX_VIEWS.map((v) => {
          const current = v === view
          return (
            <li key={v}>
              <a
                href={hrefOf(v)}
                aria-current={current ? "page" : undefined}
                onClick={(e: MouseEvent) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
                  e.preventDefault()
                  onView(v)
                }}
                className={cn(
                  "relative inline-flex h-11 items-center gap-1.5 rounded-[2px] font-sans text-sm whitespace-nowrap focus-inset transition-colors duration-150",
                  current
                    ? "font-semibold text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {INBOX_VIEW_LABELS[v]}
                <Count
                  n={counts[v]}
                  max={maxCount}
                  className={cn(
                    "text-left font-normal",
                    v === "new" && counts.new > 0 ? "text-rubric" : "text-muted-foreground"
                  )}
                />
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

// ---------------------------------------------------------------------------- menus

const TRIGGER =
  "h-8 gap-1 px-2 font-normal text-muted-foreground hover:bg-transparent hover:text-foreground aria-expanded:bg-transparent aria-expanded:text-foreground data-[chosen]:text-foreground"

/** A multi-choice filter as a text menu: "Bibliography ▾", "Bibliography: ML methods ▾". */
export function FacetMenu({
  spec,
  open,
  onOpenChange,
  onChange,
  onClear,
  onCloseFocus,
}: {
  spec: FacetSpec
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onChange: (values: string[]) => void
  onClear: () => void
  /** The element to focus again on close (the menu opened from a key). */
  /** Where the focus goes as the menu closes (the inbox: its current paper, never the trigger). */
  onCloseFocus?: (e: Event) => void
}) {
  const { label, options, chosen } = spec
  const names = chosen.map((v) => options.find((o) => o.value === v)?.label ?? v)
  const shown = names.length === 0 ? null : names.length === 1 ? names[0] : `${names.length} chosen`
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          data-chosen={chosen.length ? "" : undefined}
          className={TRIGGER}
          aria-keyshortcuts={spec.keyHint}
          aria-label={`${label}: ${shown ?? "all"}`}
        >
          <span>{label}</span>
          {shown ? (
            <span className="max-w-40 truncate font-medium">
              <span aria-hidden className="text-muted-foreground">
                :{" "}
              </span>
              {shown}
            </span>
          ) : null}
          <ChevronDownIcon aria-hidden className="size-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64" onCloseAutoFocus={onCloseFocus}>
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        {options.map((o) => {
          const checked = chosen.includes(o.value)
          return (
            <DropdownMenuCheckboxItem
              key={o.value}
              checked={checked}
              // Keep the menu open: several values may be chosen in a row.
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={(on) =>
                onChange(on ? [...chosen, o.value] : chosen.filter((v) => v !== o.value))
              }
              disabled={o.count === 0 && !checked}
            >
              <span className="min-w-0 flex-1 truncate">{o.label}</span>
              <span className="ml-3 text-kbd text-muted-foreground num">
                {formatNumber(o.count)}
              </span>
            </DropdownMenuCheckboxItem>
          )
        })}
        {chosen.length ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onClear}>Any {label.toLowerCase()}</DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The order, as a text menu saying it in words ("Most relevant first ▾"). */
export function SortMenu({
  value,
  onChange,
  open,
  onOpenChange,
  onCloseFocus,
}: {
  value: SortKey
  onChange: (v: SortKey) => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** The element to focus again on close (the menu opened from a key). */
  /** Where the focus goes as the menu closes (the inbox: its current paper, never the trigger). */
  onCloseFocus?: (e: Event) => void
}) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={TRIGGER}
          aria-keyshortcuts="s"
          aria-label={`Order: ${SORT_PHRASES[value]}`}
        >
          <span className="text-foreground">{SORT_PHRASES[value]}</span>
          <ChevronDownIcon aria-hidden className="size-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60" onCloseAutoFocus={onCloseFocus}>
        <DropdownMenuLabel>Order</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(v) => {
            const key = SORT_KEYS.find((k) => k === v)
            if (key) onChange(key)
          }}
        >
          {SORT_KEYS.map((k) => (
            <DropdownMenuRadioItem key={k} value={k}>
              {SORT_LABELS[k]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The filter box (`/`): quiet until used. */
export function FilterField({
  value,
  onChange,
  inputRef,
  className,
}: {
  value: string
  onChange: (value: string) => void
  inputRef: RefObject<HTMLInputElement | null>
  className?: string
}) {
  return (
    <span className={cn("relative inline-flex items-center", className)}>
      <input
        ref={inputRef}
        data-slot="input"
        data-page-filter
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && value) {
            e.preventDefault()
            onChange("")
          } else if (e.key === "Escape" || e.key === "Enter") {
            e.currentTarget.blur()
          }
        }}
        placeholder="Filter"
        aria-label="Filter the papers"
        aria-keyshortcuts="/"
        autoComplete="off"
        spellCheck={false}
        className="h-8 w-full min-w-0 rounded-lg border border-transparent bg-transparent pr-7 pl-2 font-sans text-sm transition-colors duration-150 placeholder:text-muted-foreground hover:border-rule-strong focus-visible:border-input focus-visible:-outline-offset-1 [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear the filter"
          onClick={() => onChange("")}
          className="absolute right-1 inline-flex size-6 items-center justify-center rounded-[3px] text-muted-foreground hover:text-foreground"
        >
          <XIcon aria-hidden className="size-3.5" />
        </button>
      ) : (
        <Kbd hint aria-hidden className="absolute right-1.5">
          /
        </Kbd>
      )}
    </span>
  )
}

// ---------------------------------------------------------------------------- the phone's sheet

/** Phones: the views, the order and the filters in one bottom sheet. */
export function ViewsAndFilters({
  open,
  onOpenChange,
  view,
  counts,
  onView,
  sort,
  onSort,
  facets,
  onFacet,
  query,
  onQuery,
  filtered,
  onClear,
  onCloseFocus,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  view: InboxView
  counts: InboxViewCounts
  onView: (view: InboxView) => void
  sort: SortKey
  onSort: (sort: SortKey) => void
  facets: readonly FacetSpec[]
  onFacet: (facet: Facet, values: string[]) => void
  query: string
  onQuery: (q: string) => void
  filtered: boolean
  onClear: () => void
  onCloseFocus?: (e: Event) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="gap-0" onCloseAutoFocus={onCloseFocus}>
        <SheetHeader className="pb-1">
          <SheetTitle>Views &amp; filters</SheetTitle>
          <SheetDescription className="sr-only">
            Choose the view, the order and what the list shows.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-5 px-4 pb-2">
          <Choices label="View">
            {INBOX_VIEWS.map((v) => (
              <Choice
                key={v}
                type="radio"
                name="inbox-view"
                checked={v === view}
                onChange={() => onView(v)}
                count={counts[v]}
              >
                {INBOX_VIEW_LABELS[v]}
              </Choice>
            ))}
          </Choices>
          <Choices label="Order">
            {SORT_KEYS.map((k) => (
              <Choice
                key={k}
                type="radio"
                name="inbox-sort"
                checked={k === sort}
                onChange={() => onSort(k)}
              >
                {SORT_LABELS[k]}
              </Choice>
            ))}
          </Choices>
          {facets.map((spec) =>
            spec.options.length > 1 || spec.chosen.length ? (
              <Choices key={spec.facet} label={spec.label}>
                {spec.options.map((o) => {
                  const checked = spec.chosen.includes(o.value)
                  return (
                    <Choice
                      key={o.value}
                      type="checkbox"
                      checked={checked}
                      disabled={o.count === 0 && !checked}
                      count={o.count}
                      onChange={(on) =>
                        onFacet(
                          spec.facet,
                          on ? [...spec.chosen, o.value] : spec.chosen.filter((v) => v !== o.value)
                        )
                      }
                    >
                      {o.label}
                    </Choice>
                  )
                })}
              </Choices>
            ) : null
          )}
          <label className="block">
            <span className="mb-1 block label">Words</span>
            <input
              type="search"
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              placeholder="Titles, authors, summaries…"
              aria-label="Filter the papers"
              autoComplete="off"
              spellCheck={false}
              className="h-11 w-full rounded-lg border border-input bg-transparent px-3 font-sans text-base placeholder:text-muted-foreground focus-visible:-outline-offset-1"
            />
          </label>
        </div>
        <SheetFooter className="sticky bottom-0 flex-row justify-end gap-2 border-t border-border bg-popover">
          {filtered ? (
            <Button variant="ghost" className="mr-auto text-muted-foreground" onClick={onClear}>
              Clear filters
            </Button>
          ) : null}
          <Button variant="outline" className="min-w-28" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function Choices({ label, children }: { label: string; children: ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-0.5 label">{label}</legend>
      <div className="divide-y divide-border">{children}</div>
    </fieldset>
  )
}

function Choice({
  type,
  name,
  checked,
  disabled,
  count,
  onChange,
  children,
}: {
  type: "radio" | "checkbox"
  name?: string
  checked: boolean
  disabled?: boolean
  count?: number
  onChange: (checked: boolean) => void
  children: ReactNode
}) {
  return (
    <label
      data-touch-row
      className={cn(
        "flex min-h-11 items-center gap-3 font-sans text-note",
        disabled && "opacity-50"
      )}
    >
      <input
        type={type}
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 shrink-0 accent-[var(--foreground)]"
      />
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {count !== undefined ? (
        <span className="text-sm text-muted-foreground num">{formatNumber(count)}</span>
      ) : null}
    </label>
  )
}
