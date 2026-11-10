"use client"

import Link from "next/link"
import { useState, type ReactNode } from "react"

import { CiteLine } from "@/components/content/cite"
import { referenceParts, type CiteCard } from "@/lib/cite"
import { Typeset } from "@/components/content/typeset"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { readArticleView, type ArticleEntry } from "@/lib/data"
import { routes } from "@/lib/routes"
import { typeset } from "@/lib/typeset"

import { useArticleContext } from "./article-context"
import { headlineMetrics } from "./article-model"
import { MetricValueText } from "./key-metrics"

/** How long the pointer or the focus rests on a link before its card shows. */
export const CARD_DELAY_MS = 350

/**
 * A link to another article of the library. After 350 ms of hover or focus, a 320 px card says what
 * that article found: its cite and title, its one-liner and its starred metrics. The link works the
 * same without it (touch screens, an article the library does not have).
 */
export function ArticleLink({
  bib,
  articleKey,
  text,
  children,
}: {
  bib: string
  articleKey: string
  /** The link's words in the data: a cite or a key is drawn as the article's cite line. */
  text?: string
  children: ReactNode
}) {
  const { lookup } = useArticleContext()
  const [open, setOpen] = useState(false)
  const entry = lookup?.(bib, articleKey)
  const cite = entry && text !== undefined ? citeShape(text, entry.article) : null
  const link = (
    <Link href={routes.article(bib, articleKey)} className="link">
      {cite ? <CiteLine card={entry!.article} venue={cite === "venue"} /> : children}
    </Link>
  )
  if (!entry) return link
  return (
    <HoverCard open={open} onOpenChange={setOpen} openDelay={CARD_DELAY_MS}>
      <HoverCardTrigger asChild>{link}</HoverCardTrigger>
      <HoverCardContent side="top" align="start">
        {open ? <ArticleCard entry={entry} /> : null}
      </HoverCardContent>
    </HoverCard>
  )
}

/**
 * Whether a link's words are the article's cite or key ("Card et al. 2024, N Engl J Med",
 * "card2024"): then the cite line is drawn (surnames in small caps, the venue in italic) instead of
 * the raw string; "venue" when the words named it. Other words ("the 2024 follow-up") stay.
 */
export function citeShape(text: string, article: CiteCard): "venue" | "bare" | null {
  const t = text.trim()
  if (!t) return null
  if (t === article.key) return "bare"
  const { lead, venue } = referenceParts(article)
  const cite = article.cite.trim()
  if (t === cite || (venue && t === `${lead}, ${venue}`)) return venue ? "venue" : "bare"
  if (t === lead) return "bare"
  if (lead && t.startsWith(`${lead},`)) return "venue"
  return null
}

/** What the card says: built only when it opens. */
function ArticleCard({ entry }: { entry: ArticleEntry }) {
  const { article } = entry
  const { view } = readArticleView(article)
  const metrics = view ? headlineMetrics(view.sections) : []
  return (
    <div className="space-y-2">
      <p className="text-small text-muted-foreground">
        <CiteLine card={article} className="font-serif text-note" />
      </p>
      <p className="item-title text-item">{typeset(article.title)}</p>
      {article.one_line ? (
        <p className="gloss text-ui text-foreground">
          <Typeset text={article.one_line} acronyms />
        </p>
      ) : null}
      {metrics.length > 0 ? (
        <ul className="space-y-1.5 border-t border-border pt-2 font-sans text-small">
          {metrics.map((m, i) => (
            <li key={i}>
              <span className="clamp-fade-2 text-foreground num">
                <MetricValueText text={m.value} />
              </span>
              {m.metric ? (
                <span className="truncate-fade block text-muted-foreground">
                  {typeset(m.metric)}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
