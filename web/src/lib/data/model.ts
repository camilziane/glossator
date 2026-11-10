/**
 * The library once parsed, with its lookup maps: built once per load, shared by every component.
 */
import type { Article, Bibliography, Inbox, InboxPaper, Library } from "./schema"

/** An article with its bibliography. `ref` is `<bib>/<key>`, unique across the library. */
export interface ArticleEntry {
  readonly ref: string
  readonly bib: Bibliography
  readonly article: Article
}

/** An item of the data that does not follow the format: left out, and said quietly. */
export interface DataProblem {
  kind: "bibliography" | "table" | "article" | "inbox paper"
  /** `<bib>`, `<bib>/<table>`, `<bib>/<key>` or the paper's id (a position when it has none). */
  ref: string
  /** The first validation issues. */
  detail: string
}

export interface LibraryIndex {
  readonly data: Library
  /** What was left out of the data because it does not follow the format. */
  readonly problems: readonly DataProblem[]
  readonly bibliographies: readonly Bibliography[]
  /** Every article of every bibliography, each bibliography's newest first. */
  readonly articles: readonly ArticleEntry[]
  readonly inbox: Inbox | null
  /** The bibliography names, for membership tests. */
  readonly bibNames: ReadonlySet<string>
  bib(name: string): Bibliography | undefined
  article(bib: string, key: string): ArticleEntry | undefined
  inboxPaper(id: string): InboxPaper | undefined
}

export function articleRef(bib: string, key: string): string {
  return `${bib}/${key}`
}

export function indexLibrary(data: Library, problems: readonly DataProblem[] = []): LibraryIndex {
  const bibs = new Map<string, Bibliography>()
  const articles = new Map<string, ArticleEntry>()
  const list: ArticleEntry[] = []
  for (const bib of data.bibliographies) {
    bibs.set(bib.name, bib)
    for (const article of bib.articles) {
      const entry: ArticleEntry = { ref: articleRef(bib.name, article.key), bib, article }
      articles.set(entry.ref, entry)
      list.push(entry)
    }
  }
  const papers = new Map<string, InboxPaper>((data.inbox?.papers ?? []).map((p) => [p.id, p]))
  return {
    data,
    problems,
    bibliographies: data.bibliographies,
    articles: list,
    inbox: data.inbox,
    bibNames: new Set(bibs.keys()),
    bib: (name) => bibs.get(name),
    article: (bib, key) => articles.get(articleRef(bib, key)),
    inboxPaper: (id) => papers.get(id),
  }
}
