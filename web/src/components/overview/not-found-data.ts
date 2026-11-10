/** What the 404 page suggests, from the path that led nowhere. */
import { type LibraryIndex } from "@/lib/data"
import { routes } from "@/lib/routes"

export interface NotFoundSuggestion {
  kind: "article" | "bibliography"
  label: string
  detail: string
  href: string
}

function decode(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

/** The path's meaningful parts: decoded, without "index.html" or a ".html" ending. */
export function pathSegments(pathname: string): string[] {
  return pathname
    .split("/")
    .map((s) => decode(s).replace(/\.html?$/i, ""))
    .filter((s) => s && s.toLowerCase() !== "index")
}

/**
 * Bibliographies and articles the path names, in any position and any case: `/ml/novak2024`,
 * `/article/ml/novak2024/`, `/ML`, `/novak2024` (a key alone, looked up in every bibliography).
 */
export function notFoundSuggestions(
  pathname: string,
  lib: LibraryIndex,
  limit = 4
): NotFoundSuggestion[] {
  const segments = pathSegments(pathname)
  const bibByName = new Map(lib.bibliographies.map((b) => [b.name.toLowerCase(), b]))
  const out: NotFoundSuggestion[] = []
  const add = (s: NotFoundSuggestion) => {
    if (!out.some((o) => o.href === s.href)) out.push(s)
  }
  const addArticle = (bibName: string, key: string) => {
    const lower = key.toLowerCase()
    const article = lib.bib(bibName)?.articles.find((a) => a.key.toLowerCase() === lower)
    const entry = article ? lib.article(bibName, article.key) : undefined
    if (entry) {
      add({
        kind: "article",
        label: entry.article.cite,
        detail: entry.bib.short || entry.bib.title,
        href: routes.article(entry.bib.name, entry.article.key),
      })
    }
  }
  segments.forEach((segment, i) => {
    const bib = bibByName.get(segment.toLowerCase())
    if (bib) {
      const next = segments[i + 1]
      if (next) addArticle(bib.name, next)
      add({
        kind: "bibliography",
        label: bib.short || bib.title,
        detail: bib.title,
        href: routes.bib(bib.name),
      })
      return
    }
    for (const b of lib.bibliographies) addArticle(b.name, segment)
  })
  return out.slice(0, limit)
}

/** Words to search for, from the path's last part (`/protein-folding.html` → "protein folding"). */
export function searchQueryFromPath(pathname: string): string {
  const last = pathSegments(pathname).at(-1) ?? ""
  return last
    .replace(/[-_+.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60)
}
