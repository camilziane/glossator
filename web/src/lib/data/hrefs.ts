/**
 * Links found in the data, made safe. Only three kinds are ever used as an href: a web address
 * (http or https), a file under library/ (served by `glossator serve` beside the app, resolved against
 * the site root) and an in-page anchor. Anything else (javascript:, data:, a relative path) is refused.
 */
import { routes } from "@/lib/routes"

export type ResolvedHref =
  | { kind: "external"; href: string }
  | { kind: "file"; href: string }
  | { kind: "anchor"; href: string }

const LIBRARY_PREFIX = "library/"

/** A data href as a safe link, or null when it is none of the three allowed kinds. */
export function resolveHref(href: string): ResolvedHref | null {
  const h = href.trim()
  if (/^https?:\/\//i.test(h)) {
    try {
      const url = new URL(h)
      return url.protocol === "http:" || url.protocol === "https:"
        ? { kind: "external", href: url.href }
        : null
    } catch {
      return null
    }
  }
  if (h.startsWith(LIBRARY_PREFIX)) {
    const href = libraryHref(h)
    return href ? { kind: "file", href } : null
  }
  if (h.startsWith("#") && h.length > 1) return { kind: "anchor", href: h }
  return null
}

/**
 * `library/<path>` as an absolute, encoded URL (`/library/a%20b/c.pdf`), or null for a path that
 * leaves library/ or passes through a hidden folder (the server refuses those too).
 */
export function libraryHref(path: string): string | null {
  if (!path.startsWith(LIBRARY_PREFIX)) return null
  const parts = path.split("/").filter(Boolean)
  if (parts.some((p) => p === ".." || p.startsWith("."))) return null
  return "/" + parts.map((p) => encodeURIComponent(p)).join("/")
}

/** A file of an article's folder: `paper.pdf`, `figures/…`, `supplementary/…`, `record.json`. */
export function articleFileHref(bib: string, key: string, file: string): string | null {
  return libraryHref(`${LIBRARY_PREFIX}${bib}/articles/${key}/${file}`)
}

/** A PDF opened at a page (`…/paper.pdf#page=5`); the browser's viewer honours the fragment. */
export function pdfPageHref(href: string, page: number | null | undefined): string {
  return page && page > 0 && /\.pdf$/i.test(href) ? `${href}#page=${page}` : href
}

/** The record field a search passage comes from: `record:details` → "details", `record:metrics[2]` → "metrics". */
export function recordField(source: string): string | null {
  const m = /^record:([^[\]]+)(?:\[\d+\])?$/.exec(source)
  return m?.[1] ?? null
}

/** A search hit's place: an article's section (a record passage) or a page of one of its files. */
export function hitHref(
  hit: { bib: string; key: string; source: string; page: number | null },
  sectionIds?: readonly string[]
): string {
  const field = recordField(hit.source)
  if (field !== null) {
    const id = field.replaceAll("_", "-")
    return routes.article(hit.bib, hit.key, sectionIds?.includes(id) ? id : undefined)
  }
  const file = articleFileHref(hit.bib, hit.key, hit.source)
  return file ? pdfPageHref(file, hit.page) : routes.article(hit.bib, hit.key)
}

/**
 * A DOI as a link (`https://doi.org/…`), or null for an empty one. Each part is encoded on its own:
 * a DOI may hold `#`, `?` or `%`, which would otherwise cut it or change its meaning.
 */
export function doiHref(doi: string): string | null {
  const d = doi.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
  return d ? `https://doi.org/${d.split("/").map(encodeURIComponent).join("/")}` : null
}
