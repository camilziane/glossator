"use client"

import Link from "next/link"

import { CiteLine } from "@/components/content/cite"
import { DraftBadge, SeriousNoticeBadge } from "@/components/content/notice-badge"
import { Typeset } from "@/components/content/typeset"
import { type ArticleEntry } from "@/lib/data"
import { guessLang } from "@/lib/lang"
import { routes } from "@/lib/routes"
import { cn } from "@/lib/utils"

import { type YearGroup } from "./today-data"
import { TODAY_ROW, TODAY_ROW_LINK, TODAY_TEXT } from "./today-grid"

/**
 * The most recently published articles of every bibliography, by year: the year hangs in the left
 * margin like the article's rubrics (above its articles below 1280 px); each article gives its title,
 * its citation, then its one-liner in full, and the whole entry is its link.
 */
export function TodayRecent({
  groups,
  from,
  className,
}: {
  groups: readonly YearGroup[]
  /** The list the article links carry (`useFromHere()`), for the article's pager and Esc. */
  from: string | null
  className?: string
}) {
  if (groups.length === 0) return null
  return (
    <section aria-labelledby="today-recent" className={cn(TODAY_ROW, className)}>
      <h2
        id="today-recent"
        className={cn(TODAY_TEXT, "mb-2 font-serif text-read font-semibold text-foreground")}
      >
        Recently published
      </h2>
      <ul className={TODAY_ROW}>
        {groups.map((group, i) => (
          <li key={String(group.year)} className={cn(TODAY_ROW, "items-baseline", i > 0 && "mt-5")}>
            <h3 className="col-start-2 row-start-1 mb-1 font-serif text-note leading-[1.3125rem] font-semibold text-muted-foreground num xl:col-start-1 xl:mb-0 xl:justify-self-end xl:pr-12">
              {group.year ?? "Undated"}
            </h3>
            <ul className={cn(TODAY_TEXT, "row-start-2 min-w-0 xl:row-start-1")}>
              {group.entries.map((entry) => (
                <RecentArticle key={entry.ref} entry={entry} from={from} />
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  )
}

function RecentArticle({ entry, from }: { entry: ArticleEntry; from: string | null }) {
  const { bib, article } = entry
  const draft = article.status !== "complete"
  const title = article.title && article.title !== article.key ? article.title : article.cite
  const lang = guessLang(article.title)
  return (
    <li className="relative isolate py-2.5">
      <Link
        href={routes.article(bib.name, article.key, undefined, { from })}
        // The article's own ref (`<bib>/<key>`), as every list keys its rows: Esc from the article
        // (or after paging with [ ]) names it, and the focus comes back to it.
        data-today-row={entry.ref}
        lang={lang}
        className={cn("block rounded-[2px] item-title text-item text-foreground", TODAY_ROW_LINK)}
      >
        <Typeset text={title} lang={lang} />
      </Link>
      <p className="mt-0.5 font-serif text-gloss text-muted-foreground">
        <CiteLine card={article} />
        <span aria-hidden> · </span>
        <span className="sr-only">, in </span>
        {bib.short || bib.name}
        <SeriousNoticeBadge notices={article.notices} className="ml-2" />
        {draft ? <DraftBadge className="ml-2" /> : null}
      </p>
      {article.one_line ? (
        <p className="mt-1 font-serif text-note text-pretty text-foreground [font-variant-numeric:oldstyle-nums]">
          <Typeset text={article.one_line} acronyms />
        </p>
      ) : (
        <p className="mt-1 font-serif text-note text-muted-foreground italic">
          {article.error ? "Its record does not follow the format yet." : "Being curated."}
        </p>
      )}
    </li>
  )
}
