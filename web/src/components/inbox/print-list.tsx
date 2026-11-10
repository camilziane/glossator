"use client"

import { formatCount, formatShortDate, shortVenue } from "@/lib/format"
import { INBOX_VIEW_LABELS, type InboxView } from "@/lib/inbox-views"
import { guessLang } from "@/lib/lang"
import { relevanceLabel } from "@/lib/labels"
import { typeset } from "@/lib/typeset"

import type { InboxList } from "./inbox-model"
import { useBibName } from "./paper-parts"

/**
 * The view as it prints: a plain list (never the virtual one, which draws a window of rows), each
 * paper with its meta line, the triage's summary and its reason. Shown only on paper.
 */
export function PrintList({ view, list }: { view: InboxView; list: InboxList }) {
  const bibName = useBibName()
  const groups = list.groups.filter((g) => g.count > 0)
  return (
    <section aria-hidden className="hidden print:block">
      <h2 className="title">
        Inbox · {INBOX_VIEW_LABELS[view]}{" "}
        <span className="font-sans text-sm font-normal text-muted-foreground">
          {formatCount(list.shown.length, "paper")}
        </span>
      </h2>
      {groups.map((g) => (
        <div key={g.key} className="mt-4 break-inside-auto">
          {g.label ? <h3 className="label">{g.label}</h3> : null}
          <ol className="mt-1 space-y-3">
            {g.rows
              .filter((r) => !r.collapsed)
              .map(({ row: { paper } }) => {
                const t = paper.triage
                const meta = [
                  t.bib ? bibName(t.bib) : null,
                  t.relevance !== null ? relevanceLabel(t.relevance) : null,
                  paper.venue ? shortVenue(paper.venue) : null,
                  paper.date ? formatShortDate(paper.date) : null,
                ].filter(Boolean)
                return (
                  <li key={paper.id} className="break-inside-avoid">
                    <p
                      lang={guessLang(paper.title)}
                      className="item-title text-[11pt] leading-tight"
                    >
                      {typeset(paper.title, guessLang(paper.title))}
                    </p>
                    <p className="font-sans text-[8.5pt] text-muted-foreground">
                      {meta.join(" · ")}
                    </p>
                    {t.summary ? (
                      <p
                        lang={guessLang(t.summary)}
                        className="mt-0.5 font-serif text-[10pt] leading-snug"
                      >
                        {typeset(t.summary, guessLang(t.summary))}
                      </p>
                    ) : null}
                    {t.why ? (
                      <p
                        lang={guessLang(t.why)}
                        className="font-serif text-[9.5pt] leading-snug text-muted-foreground italic"
                      >
                        {typeset(t.why, guessLang(t.why))}
                      </p>
                    ) : null}
                  </li>
                )
              })}
          </ol>
        </div>
      ))}
    </section>
  )
}
