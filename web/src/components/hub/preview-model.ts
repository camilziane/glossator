/**
 * What the preview drawer shows of an article, read from its view: the one-liner, the key metrics
 * (the headline rows first), the figures (as thumbnails) and its PDF. Pure, memoized per article.
 */
import {
  foldText,
  plainText,
  readArticleView,
  resolveHref,
  type Article,
  type ArticleView,
  type Inlines,
  type TableBlock,
} from "@/lib/data"

export interface PreviewMetric {
  /** A headline result (★ in the record). */
  readonly star: boolean
  readonly metric: Inlines
  readonly value: Inlines
  readonly condition: Inlines
}

export interface PreviewFigure {
  readonly src: string
  readonly alt: string
  /** The section it is in (the article opens there). */
  readonly section: string
}

export interface Preview {
  /** The one-liner (the view's lead, else the card's). */
  readonly lede: Inlines
  readonly metrics: { readonly section: string; readonly rows: readonly PreviewMetric[] } | null
  readonly figures: readonly PreviewFigure[]
  /** The PDF to open (null when there is none here: not downloaded, or no file). */
  readonly pdf: string | null
  /** Why the record has no view (it could not be read). */
  readonly error: string | null
}

/** At most this many metrics in the drawer (headline ones first); the article has them all. */
export const PREVIEW_METRICS = 6
export const PREVIEW_FIGURES = 6

const METRIC_SECTIONS = /^(?:key[- ])?(?:metrics?|results?)$/

/** The section of key metrics (or key results) and its table, if the record has one. */
export function metricsTable(view: ArticleView): { section: string; table: TableBlock } | null {
  for (const section of view.sections) {
    if (!METRIC_SECTIONS.test(section.id) && !METRIC_SECTIONS.test(foldText(section.title)))
      continue
    for (const block of section.blocks) {
      if (block.t !== "table") continue
      const head = block.head.map((h) => foldText(h).trim())
      if (head.includes("metric") && head.includes("value"))
        return { section: section.id, table: block }
    }
  }
  return null
}

function readMetrics(view: ArticleView): Preview["metrics"] {
  const found = metricsTable(view)
  if (!found) return null
  const head = found.table.head.map((h) => foldText(h).trim())
  const col = (name: string) => head.indexOf(name)
  const [star, metric, value, condition] = [col("★"), col("metric"), col("value"), col("condition")]
  const rows = found.table.rows.map((cells) => ({
    star: star >= 0 && plainText(cells[star] ?? []).includes("★"),
    metric: cells[metric] ?? [],
    value: cells[value] ?? [],
    condition: condition >= 0 ? (cells[condition] ?? []) : [],
  }))
  // Headline rows first, each group in the record's order.
  const ordered = [...rows.filter((r) => r.star), ...rows.filter((r) => !r.star)]
  return ordered.length ? { section: found.section, rows: ordered.slice(0, PREVIEW_METRICS) } : null
}

function readFigures(view: ArticleView): PreviewFigure[] {
  const figures: PreviewFigure[] = []
  for (const section of view.sections) {
    for (const block of section.blocks) {
      if (block.t !== "figure") continue
      const link = resolveHref(block.src)
      if (link?.kind !== "file") continue
      figures.push({ src: link.href, alt: block.alt, section: section.id })
    }
  }
  return figures.slice(0, PREVIEW_FIGURES)
}

function readPdf(view: ArticleView): string | null {
  const file = view.files.find((f) => f.primary) ?? view.files.find((f) => /\.pdf$/i.test(f.href))
  // "PDF · to fetch": named in the record, not downloaded here.
  if (!file || /\bto fetch\s*$/i.test(file.label)) return null
  const link = resolveHref(file.href)
  return link && link.kind !== "anchor" ? link.href : null
}

const cache = new WeakMap<Article, Preview>()

export function previewOf(article: Article): Preview {
  let preview = cache.get(article)
  if (!preview) {
    const { view, error } = readArticleView(article)
    const lead = view && plainText(view.lead).trim() ? view.lead : []
    preview = {
      lede: lead.length ? lead : article.one_line ? [article.one_line] : [],
      metrics: view ? readMetrics(view) : null,
      figures: view ? readFigures(view) : [],
      pdf: view ? readPdf(view) : null,
      error,
    }
    cache.set(article, preview)
  }
  return preview
}
