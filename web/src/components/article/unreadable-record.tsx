import { InlineCommand } from "@/components/content/cli-command"
import { articleFileHref, doiHref, type ArticleEntry } from "@/lib/data"
import { commands } from "@/lib/site"

/**
 * An article whose record does not follow the format: in the page, no box: what is wrong (the tool's
 * words), and the commands that find and fix it. Its record and its DOI stay one click away.
 */
export function UnreadableRecord({
  entry,
  error,
}: {
  entry: ArticleEntry
  /** What the tool reported, or what is wrong with the record's page (readArticleView). */
  error: string | null
}) {
  const { article, bib } = entry
  const record = articleFileHref(bib.name, article.key, "record.json")
  const doi = doiHref(article.doi)
  return (
    <section aria-labelledby="unreadable-title" className="max-w-measure">
      <h2 id="unreadable-title" className="title text-warning">
        This article’s record could not be read
      </h2>
      <p className="mt-3 reading">
        Its summary cannot be shown: the record does not follow the format of its bibliography’s
        profile ({bib.profile}). What the tool reported:
      </p>
      <pre className="mt-3 overflow-x-auto bg-muted px-3 py-2 font-mono text-small whitespace-pre-wrap">
        {error || "An unknown error."}
      </pre>
      <p className="mt-3 reading">
        Run <InlineCommand>{commands.check(article.key, bib.name)}</InlineCommand> to see what is
        wrong, fix <code className="mono">record.json</code>, then run{" "}
        <InlineCommand>{commands.build}</InlineCommand> and reload this page.
      </p>
      <p className="mt-4 flex flex-wrap gap-x-5 gap-y-1 font-sans text-ui">
        {record ? (
          <a href={record} target="_blank" rel="noopener noreferrer" className="mono link">
            record.json
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : null}
        {doi ? (
          <a href={doi} target="_blank" rel="noopener noreferrer" className="link">
            doi:{article.doi}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : null}
      </p>
    </section>
  )
}
