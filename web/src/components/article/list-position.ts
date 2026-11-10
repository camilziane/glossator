/**
 * Where an article sits in the list the reader came from (`from`: a hub with its filter and sort, a
 * search, the inbox, Today), or in its bibliography when there is none: its folio ("2 of 11") and
 * its neighbours for `[` and `]`.
 */
import { readListOrder } from "@/hooks/use-list-memory"
import type { ArticleEntry, LibraryIndex } from "@/lib/data"
import { parseFrom, routes, type ListContext } from "@/lib/routes"

export interface ListPosition {
  /** The list the reader came from (null: the bibliography, newest first). */
  list: ListContext | null
  /** 1-based place of the article. */
  position: number
  count: number
  previous: ArticleEntry | null
  next: ArticleEntry | null
  /** Where the list is, for Esc: the `from` value, else the bibliography's hub. */
  back: string
}

/**
 * The article's place: in the order the list said it showed (`rememberListOrder`), when the article
 * is in it; else in its bibliography. `order`: the list's refs (`readListOrder(from)`).
 */
export function listPosition(
  lib: Pick<LibraryIndex, "article">,
  entry: ArticleEntry,
  from: string,
  order: readonly string[] | null
): ListPosition {
  const list = parseFrom(from)
  const inList = list && order?.includes(entry.ref) ? order : null
  const refs = inList ?? entry.bib.articles.map((a) => `${entry.bib.name}/${a.key}`)
  const at = refs.indexOf(entry.ref)
  const find = (ref: string | undefined) => {
    if (!ref) return null
    const slash = ref.indexOf("/")
    return lib.article(ref.slice(0, slash), ref.slice(slash + 1)) ?? null
  }
  return {
    list: inList ? list : null,
    position: at + 1,
    count: refs.length,
    previous: at > 0 ? find(refs[at - 1]) : null,
    next: at >= 0 ? find(refs[at + 1]) : null,
    back: list ? list.href : routes.bib(entry.bib.name),
  }
}

/** The order the list said it showed, read in the browser (null on the server, or without one). */
export function readOrder(from: string): string[] | null {
  if (typeof window === "undefined" || !parseFrom(from)) return null
  return readListOrder(from)
}
