"use client"

import { CopyButton } from "@/components/content/copy-button"
import { articleFileHref, type ArticleEntry, type Inlines } from "@/lib/data"
import { formatDate } from "@/lib/format"
import { commands } from "@/lib/site"
import { typeset } from "@/lib/typeset"
import { cn } from "@/lib/utils"

import { colophonOf } from "./article-model"

/**
 * The colophon at the article's end, small and muted: who curated the record and when, its key (to
 * copy), the record itself, and the command that rebuilds the page after an edit.
 */
export function Colophon({
  entry,
  footer,
  className,
}: {
  entry: ArticleEntry
  footer: Inlines
  className?: string
}) {
  const { article, bib } = entry
  const record = articleFileHref(bib.name, article.key, "record.json")
  const { verb, date, by, rest } = colophonOf(footer)
  return (
    <footer
      className={cn(
        "border-t border-border pt-4 font-sans text-small text-pretty text-muted-foreground",
        className
      )}
    >
      <p>
        {date ? (
          <span>
            {verb || "Curated"} {formatDate(date)}
            {by ? ` by ${typeset(by)}` : ""}
            <span aria-hidden="true"> · </span>
          </span>
        ) : null}
        <span className="whitespace-nowrap">
          key <code className="mono text-foreground">{article.key}</code>{" "}
          <CopyButton
            value={article.key}
            iconOnly
            size="icon-xs"
            what={`the citation key ${article.key}`}
            className="-my-1 align-middle text-muted-foreground hover:text-foreground data-[copy-state=copied]:text-success print:hidden"
          />
        </span>
        {record ? (
          <span className="whitespace-nowrap">
            <span aria-hidden="true"> · </span>
            <a href={record} target="_blank" rel="noopener noreferrer" className="mono link">
              record.json
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </span>
        ) : null}
      </p>
      {rest.map((sentence, i) => (
        <p key={i} className="mt-1">
          {typeset(sentence)}
        </p>
      ))}
      <p className="mt-1">
        To correct it, edit the record, then run{" "}
        <code className="mono text-foreground">{commands.build}</code>.
      </p>
    </footer>
  )
}
