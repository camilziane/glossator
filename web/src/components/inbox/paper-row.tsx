"use client"

import { memo } from "react"

import { RelevanceMark } from "@/components/content/relevance"
import { Checkbox } from "@/components/ui/checkbox"
import type { InboxPaper, InboxStatus } from "@/lib/data"
import type { Decision } from "@/lib/inbox-decisions"
import { guessLang } from "@/lib/lang"
import { typeset } from "@/lib/typeset"
import { cn } from "@/lib/utils"

import { hookOf } from "./inbox-model"
import { paperDomId, RowMeta } from "./paper-parts"

/**
 * What the list hands every row: stable functions taking the paper's id, so a row re-renders only
 * when its own props change (a key press touches two rows, not the whole list).
 */
export interface PaperHandlers {
  /** A click or the focus: the paper becomes the current one. */
  onActivate: (id: string) => void
  /** A click where the paper opens on the whole screen (phones and tablets). */
  onOpen: (id: string) => void
  onSelect: (id: string, selected: boolean) => void
  /** The row's element (focus, scrolling) as it mounts, and null as it unmounts. */
  register: (id: string, el: HTMLElement | null) => void
}

export interface PaperRowProps {
  paper: InboxPaper
  status: InboxStatus
  pending: boolean
  /** Decided this session (its state shows first in the meta line). */
  decided: boolean
  /** 1-based place among the rows shown (aria-posinset) and how many there are. */
  position: number
  total: number
  active: boolean
  selected: boolean
  /** Selection mode (`x`): a checkbox in the gutter. */
  selecting: boolean
  /** A phone: compact meta, a tap opens the paper. */
  compact: boolean
  /** Rows open the paper on the whole screen instead of beside the list. */
  opens: boolean
  /** "found today" in the meta line. */
  showFound: boolean
  /** A decided row drawn where it was while it collapses: no id, out of the tab order. */
  ghost?: boolean
  /** A decision on it that was not saved (its row says so until it is decided again). */
  failedDecision?: Decision | null
  failedReason?: string | null
  handlers: PaperHandlers
}

/**
 * A paper as a row of the list: the relevance mark in the gutter, the serif title (up to three
 * lines), the hook (the summary's first figure, muted), one meta line. The current paper is washed;
 * the focus is a 2 px ink bar on its left edge (as a hub's row and a search passage: no box around
 * a row).
 */
export const PaperRow = memo(function PaperRow({
  paper,
  status,
  pending,
  decided,
  position,
  total,
  active,
  selected,
  selecting,
  compact,
  opens,
  showFound,
  ghost = false,
  failedDecision = null,
  failedReason = null,
  handlers,
}: PaperRowProps) {
  const domId = paperDomId(paper.id)
  const titleLang = guessLang(paper.title)
  // The summary's first figure, under the title: what makes the paper worth a look.
  const hook = hookOf(paper.triage.summary)
  const hookLang = guessLang(paper.triage.summary)
  return (
    <article
      ref={
        ghost
          ? undefined
          : (el) => {
              handlers.register(paper.id, el)
              return () => handlers.register(paper.id, null)
            }
      }
      id={ghost ? undefined : domId}
      tabIndex={ghost ? -1 : active ? 0 : -1}
      aria-labelledby={ghost ? undefined : `${domId}-title`}
      aria-posinset={ghost ? undefined : position}
      aria-setsize={ghost ? undefined : total}
      aria-busy={pending || undefined}
      aria-current={active && !ghost ? "true" : undefined}
      data-active={active || undefined}
      data-selected={selected || undefined}
      data-status={status}
      data-touch-row
      onClick={(e) => {
        if (ghost) return
        // The checkbox has its own click.
        if ((e.target as Element).closest("[data-slot=checkbox]")) return
        if (opens) handlers.onOpen(paper.id)
        else handlers.onActivate(paper.id)
      }}
      onFocus={(e) => {
        if (!ghost && !active && e.target === e.currentTarget) handlers.onActivate(paper.id)
      }}
      className={cn(
        "relative flex cursor-default gap-2.5 border-b border-border py-2 pr-3 pl-2 transition-colors duration-150 select-none focus-visible:shadow-[inset_2px_0_0_var(--foreground)] focus-visible:outline-none sm:pl-2.5",
        "hover:bg-[color-mix(in_oklab,var(--muted)_60%,transparent)] data-active:bg-muted",
        decided && "text-muted-foreground"
      )}
    >
      <div className="flex shrink-0 items-start gap-2.5 pt-px">
        {selecting && !ghost ? (
          <span className="flex h-5 items-center">
            <Checkbox
              checked={selected}
              onCheckedChange={(v) => handlers.onSelect(paper.id, v === true)}
              aria-label={`Select “${paper.title}”`}
              aria-keyshortcuts="x"
              disabled={pending}
              tabIndex={active ? 0 : -1}
            />
          </span>
        ) : null}
        <RelevanceMark
          value={paper.triage.relevance}
          className="h-5 w-4 items-center justify-center"
        />
      </div>
      <div className="min-w-0 flex-1">
        <h2
          id={ghost ? undefined : `${domId}-title`}
          lang={titleLang}
          className={cn(
            // Whole up to three lines, no fade; a longer title (rare) ends with "…".
            "line-clamp-3 item-title text-item [text-wrap:pretty] hyphens-none",
            decided ? "font-normal" : "text-foreground"
          )}
        >
          {typeset(paper.title, titleLang)}
        </h2>
        {hook ? (
          <p
            lang={hookLang}
            className="mt-0.5 line-clamp-2 font-serif text-gloss text-pretty text-muted-foreground [font-variant-numeric:oldstyle-nums_proportional-nums]"
          >
            {typeset(hook, hookLang)}
          </p>
        ) : null}
        <RowMeta
          paper={paper}
          status={status}
          pending={pending}
          decided={decided}
          compact={compact}
          showFound={showFound}
          failure={
            failedReason !== null && failedDecision !== null
              ? { decision: failedDecision, reason: failedReason }
              : null
          }
        />
      </div>
    </article>
  )
})
