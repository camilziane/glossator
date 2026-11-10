"use client"

import { XIcon } from "lucide-react"
import { Fragment, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { formatCount, formatNumber } from "@/lib/format"
import { cn } from "@/lib/utils"

import { formatYearSpan, NOTICE_LEVEL_LABELS, statusLabel, type NoticeLevel } from "./model"
import { type TagMode, type YearRange } from "./url-state"

export interface FilterValues {
  tag: readonly string[]
  tagmode: TagMode
  status: readonly string[]
  notice: readonly NoticeLevel[]
  year: YearRange | null
}

export type FilterChange = Partial<{
  tag: string[] | null
  status: string[] | null
  notice: NoticeLevel[] | null
  year: YearRange | null
}>

/** A chosen value with its remove control: a word on a hairline (radius 4, never a pill). */
function Chip({
  children,
  label,
  onRemove,
}: {
  children: ReactNode
  label: string
  onRemove: () => void
}) {
  return (
    <span className="inline-flex h-6 items-center gap-0.5 rounded-[4px] border border-rule-strong pr-0.5 pl-2 text-foreground">
      {children}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        className="grid size-5 place-items-center rounded-[3px] text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
      >
        <XIcon aria-hidden className="size-3" />
      </button>
    </span>
  )
}

/**
 * What the table shows, in words, under the toolbar: "2 of 4 articles · Tags: Probe array and
 * Drainage · 2024–2025 · Clear the filters", each value removable. The count is the polite live
 * region (hidden while nothing is filtered: the header says the total).
 */
export function FilterLine({
  shown,
  total,
  filtered,
  params,
  onChange,
  onReset,
}: {
  shown: number
  total: number
  filtered: boolean
  params: FilterValues
  onChange: (change: FilterChange) => void
  onReset: () => void
}) {
  const without = <T,>(list: readonly T[], value: T) => {
    const next = list.filter((v) => v !== value)
    return next.length ? next : null
  }
  const conjunction = params.tagmode === "all" ? "and" : "or"
  return (
    <div
      data-print="hide"
      className={cn(
        filtered ? "flex flex-wrap items-center gap-x-2 gap-y-1.5 text-small" : "contents"
      )}
    >
      <p
        role="status"
        aria-live="polite"
        className={cn(filtered ? "mr-1 text-muted-foreground num" : "sr-only")}
      >
        {filtered ? (
          <>
            <span className="font-medium text-foreground">{formatNumber(shown)}</span> of{" "}
            {formatCount(total, "article")}
          </>
        ) : (
          formatCount(total, "article")
        )}
      </p>
      {filtered && params.tag.length ? (
        <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <span className="text-muted-foreground">Tags</span>
          {params.tag.map((tag, i) => (
            <Fragment key={tag}>
              {i > 0 ? <span className="text-muted-foreground italic">{conjunction}</span> : null}
              <Chip
                label={`the tag ${tag}`}
                onRemove={() => onChange({ tag: without(params.tag, tag) })}
              >
                {tag}
              </Chip>
            </Fragment>
          ))}
        </span>
      ) : null}
      {filtered && params.year ? (
        <Chip label="the years" onRemove={() => onChange({ year: null })}>
          <span className="num">
            {params.year.from === null
              ? `until ${params.year.to}`
              : params.year.to === null
                ? `from ${params.year.from}`
                : formatYearSpan([params.year.from, params.year.to])}
          </span>
        </Chip>
      ) : null}
      {filtered
        ? params.notice.map((n) => (
            <Chip
              key={n}
              label={NOTICE_LEVEL_LABELS[n]}
              onRemove={() => onChange({ notice: without(params.notice, n) })}
            >
              {NOTICE_LEVEL_LABELS[n]}
            </Chip>
          ))
        : null}
      {filtered
        ? params.status.map((s) => (
            <Chip
              key={s}
              label={statusLabel(s)}
              onRemove={() => onChange({ status: without(params.status, s) })}
            >
              {statusLabel(s)}
            </Chip>
          ))
        : null}
      {/* Nothing left: the table's own sentence offers it. */}
      {filtered && shown > 0 ? (
        <Button variant="link" size="sm" onClick={onReset} className="ml-1 text-small">
          Clear the filters
        </Button>
      ) : null}
    </div>
  )
}
