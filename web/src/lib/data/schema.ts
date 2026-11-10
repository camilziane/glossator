/**
 * The data contract: zod schemas mirroring src/glossator/sitedata.py (format version 1), which
 * `glossator build` writes to build/data/library.json and `glossator serve` answers at /data/library.json.
 *
 * Unknown keys are dropped. A block or inline kind this app does not know yet degrades gracefully
 * (an unknown block is skipped, an unknown inline part becomes its text), because the format may gain
 * kinds without a version change. Reading is tolerant per item (library.ts): a text field that is
 * null reads as "", a score out of its range is clamped, and an article, a table, an inbox paper or a
 * bibliography that still does not match is left out and reported, never the whole library.
 *
 * An article's view (most of the data's bytes) is not validated at load: `readArticleView()` checks
 * it the first time a page needs it; an invalid view is that article's own error.
 */
import { z } from "zod"

export const FORMAT_VERSION = 1

/** A text field: null, or absent in data written before it, reads as "". */
const text = z.preprocess((v) => v ?? "", z.string())

/** A list: null or absent reads as empty. */
function list<T extends z.ZodType>(item: T) {
  return z.preprocess((v) => v ?? [], z.array(item))
}

/** A nullable field (absent reads as null). */
function nullable<T extends z.ZodType>(schema: T) {
  return z.preprocess((v) => v ?? null, schema.nullable())
}

const clamp = (n: number, low: number, high: number) => Math.min(high, Math.max(low, n))

/** The record's words for "nothing here" (SENTINELS in records.py). */
const SENTINELS = new Set(["none", "not reported", "not applicable"])

/**
 * A reference field (volume, issue, pages, version): "" when null or a sentinel ("none"); optional in
 * the type (cards built by hand, data written before them), so read it with `?? ""`.
 */
const refText = z.preprocess(
  (v) => (typeof v === "string" && SENTINELS.has(v.trim().toLowerCase()) ? "" : (v ?? "")),
  z.string().optional()
)

// ---------------------------------------------------------------------------- inline parts

/** A link: a web address, or a file under library/ (`library/<bib>/articles/<key>/<file>`). */
export const InlineLinkSchema = z.object({
  t: z.literal("a"),
  href: z.string(),
  text: z.string(),
})

/** Another article, by its bibliography and key. */
export const InlineArticleRefSchema = z.object({
  t: z.literal("art"),
  bib: z.string(),
  key: z.string(),
  text: z.string(),
})

export const MARK_KINDS = ["em", "b", "muted", "todo", "badge", "sub"] as const
export type MarkKind = (typeof MARK_KINDS)[number]

/** Emphasis, strong, a muted value (a sentinel like "not reported"), a TODO, a badge, a sub-line. */
export const InlineMarkSchema = z.object({
  t: z.enum(MARK_KINDS),
  text: z.string(),
})

const INLINE_KINDS: ReadonlySet<string> = new Set(["a", "art", ...MARK_KINDS])

const InlineTaggedSchema = z.discriminatedUnion("t", [
  InlineLinkSchema,
  InlineArticleRefSchema,
  InlineMarkSchema,
])

/** An inline part: plain text, or a tagged part. An unknown tagged part is read as its text. */
export const InlineSchema = z.preprocess(
  (v) => (isTagged(v) && !INLINE_KINDS.has(v.t) && typeof v["text"] === "string" ? v["text"] : v),
  z.union([z.string(), InlineTaggedSchema])
)

export const InlinesSchema = z.array(InlineSchema)

// ---------------------------------------------------------------------------- blocks

export const ParagraphBlockSchema = z.object({ t: z.literal("p"), c: InlinesSchema })
export const HeadingBlockSchema = z.object({ t: z.literal("h3"), text: z.string() })
export const FieldsBlockSchema = z.object({
  t: z.literal("fields"),
  items: z.array(z.object({ label: z.string(), c: InlinesSchema })),
})
export const BulletsBlockSchema = z.object({
  t: z.literal("bullets"),
  items: z.array(InlinesSchema),
})
/** A table of an article's section. A column named "Value" holds numbers, one named "★" a star. */
export const TableBlockSchema = z.object({
  t: z.literal("table"),
  head: z.array(z.string()),
  rows: z.array(z.array(InlinesSchema)),
})
export const QuoteBlockSchema = z.object({
  t: z.literal("quote"),
  c: InlinesSchema,
  cite: InlinesSchema,
})
export const FigureBlockSchema = z.object({
  t: z.literal("figure"),
  src: z.string(),
  alt: z.string(),
  caption: InlinesSchema,
})
/** Where a section's content comes from (pages of the paper), drawn small after it. */
export const SourceBlockSchema = z.object({ t: z.literal("source"), c: InlinesSchema })

export const BLOCK_KINDS = [
  "p",
  "h3",
  "fields",
  "bullets",
  "table",
  "quote",
  "figure",
  "source",
] as const
export type BlockKind = (typeof BLOCK_KINDS)[number]
const BLOCK_KIND_SET: ReadonlySet<string> = new Set(BLOCK_KINDS)

export const BlockSchema = z.discriminatedUnion("t", [
  ParagraphBlockSchema,
  HeadingBlockSchema,
  FieldsBlockSchema,
  BulletsBlockSchema,
  TableBlockSchema,
  QuoteBlockSchema,
  FigureBlockSchema,
  SourceBlockSchema,
])

/** Blocks; a block of an unknown kind is skipped. */
export const BlocksSchema = z.preprocess(
  (v) => (Array.isArray(v) ? v.filter((b) => !isTagged(b) || BLOCK_KIND_SET.has(b.t)) : v),
  z.array(BlockSchema)
)

// ---------------------------------------------------------------------------- articles

export const ArticleFileSchema = z.object({
  href: z.string(),
  label: z.string(),
  primary: z.boolean(),
})

export const GlanceTileSchema = z.object({
  label: z.string(),
  lines: z.array(InlinesSchema),
})

export const SectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  blocks: BlocksSchema,
})

/** An article's whole view (render.article_view). */
export const ArticleViewSchema = z.object({
  kicker: InlinesSchema,
  meta: InlinesSchema,
  lab: InlinesSchema,
  files: z.array(ArticleFileSchema),
  lead: InlinesSchema,
  draft: z.boolean(),
  glance: z.array(GlanceTileSchema),
  sections: z.array(SectionSchema),
  footer: InlinesSchema,
})

/** Notice types that put an article's findings in doubt; the others (corrections, errata…) are quiet. */
export const SERIOUS_NOTICE_TYPES = [
  "retraction",
  "withdrawal",
  "removal",
  "expression_of_concern",
] as const

/** A retraction, expression of concern or correction Crossref records for the article (added in v1). */
export const NoticeSchema = z.object({
  /** "retraction" | "withdrawal" | "removal" | "expression_of_concern" | "correction" | … */
  type: text,
  label: text,
  /** The notice's own DOI. */
  doi: text,
  /** YYYY, YYYY-MM or YYYY-MM-DD. */
  date: text,
  title: text,
})

/** What lists, filters and searches an article. `tags` only for a complete one. */
export const ArticleCardSchema = z.object({
  key: z.string().min(1),
  cite: text,
  title: text,
  authors: text,
  year: nullable(z.number().int()),
  venue: text,
  doi: text,
  status: text,
  tags: list(z.string()),
  one_line: text,
  /** Absent from data written before notices existed: read as none. */
  notices: list(NoticeSchema),
  // A full reference (`@/lib/cite`). Optional in the type: data written before them reads as
  // unknown, and a card built by hand may leave them out.
  /** Every author, "Given Family" (`authors` is the short line, cut with "…"). */
  authors_full: z.preprocess((v) => v ?? [], z.array(z.string())).optional(),
  /** The journal's volume, issue and page range ("583–589"); "" when unknown. */
  volume: refText,
  issue: refText,
  pages: refText,
  /** The PDF's version: "publishedVersion", "acceptedVersion", "submittedVersion", or "" unknown. */
  version: refText,
  /** Journal page = PDF page + offset; null unless the record states it. */
  journal_offset: z.preprocess((v) => v ?? null, z.number().int().nullable()).optional(),
})

/**
 * An article: its card, and its view or, when its record does not follow the format, an error. The
 * view is read as is here and validated on first use (`readArticleView`).
 */
export const ArticleSchema = ArticleCardSchema.extend({
  view: z.unknown().optional(),
  error: z.string().optional(),
})

// ---------------------------------------------------------------------------- bibliographies

/** A table of a bibliography's hub: Articles, then the profile's own (Kinds…). */
export const HubTableSchema = z.object({
  id: z.string(),
  title: z.string(),
  head: z.array(z.string()),
  rows: z.array(z.array(InlinesSchema)),
})

/** A bibliography's own fields; its tables and articles are read one by one (library.ts). */
export const BibliographyFieldsSchema = z.object({
  name: z.string().min(1),
  short: text,
  title: text,
  profile: text,
  scope: text,
  complete: z.preprocess((v) => v ?? 0, z.number().int()),
})

export const BibliographySchema = BibliographyFieldsSchema.extend({
  tables: z.array(HubTableSchema),
  /** Newest first. */
  articles: z.array(ArticleSchema),
})

// ---------------------------------------------------------------------------- inbox

export const INBOX_STATUSES = ["new", "accepted", "rejected", "added"] as const
export type InboxStatus = (typeof INBOX_STATUSES)[number]

/** Haiku's triage of a paper; every field null when the paper is not triaged yet. */
export const TriageSchema = z.preprocess(
  (v) => v ?? {},
  z.object({
    /** A bibliography's name, or "none". */
    bib: nullable(z.string()),
    /** 0 (off topic) to 3 (central); a value out of the scale is brought back to it. */
    relevance: nullable(z.number().transform((n) => clamp(Math.round(n), 0, 3))),
    kind: nullable(z.string()),
    summary: nullable(z.string()),
    why: nullable(z.string()),
    /** Who rated it: "haiku", or "prior" (judged too far from the library, never read by Haiku). Added in v1. */
    by: nullable(z.string()),
  })
)

/** How close a paper is to the library, before any model reads it (added in v1). */
export const PriorSchema = z.object({
  /** The closest bibliography. */
  bib: text,
  /** 0 (far) to 1 (close); clamped. */
  score: z.number().transform((n) => clamp(n, 0, 1)),
  /** "similarity" (to the bibliography's articles) or "model" (a classifier trained on past decisions). */
  by: text,
})

export const InboxPaperSchema = z.object({
  id: z.string().min(1),
  title: text,
  authors: list(z.string()),
  venue: text,
  date: text,
  doi: text,
  url: text,
  /** This computer's copy, `library/inbox/pdfs/<id>.pdf`, or "". */
  pdf: text,
  /** An open PDF on the web when this computer has no copy, or "". */
  pdf_online: text,
  abstract: text,
  status: z.enum(INBOX_STATUSES),
  /** The day the inbox found it (YYYY-MM-DD). */
  found: text,
  sources: list(z.string()),
  queries: list(z.string()),
  triage: TriageSchema,
  /** Absent from data written before the prior existed: read as null. */
  prior: nullable(PriorSchema),
})

export const InboxSchema = z.object({
  last_run: text,
  /** The papers waiting for a decision (new) or to be added (accepted). */
  papers: z.array(InboxPaperSchema),
})

// ---------------------------------------------------------------------------- the library

/** The library's frame: its lists are read item by item (library.ts), so one bad item stays alone. */
export const LibraryFrameSchema = z.object({
  version: z.literal(FORMAT_VERSION),
  /** When `glossator build` wrote it (ISO 8601 with offset). */
  built: text,
  generated: text,
  bibliographies: z.array(z.unknown()),
  inbox: nullable(z.object({ last_run: text, papers: z.array(z.unknown()) })),
})

/** The whole library at once (the fixtures, tests); the app reads it item by item. */
export const LibrarySchema = z.object({
  version: z.literal(FORMAT_VERSION),
  built: text,
  generated: text,
  bibliographies: z.array(BibliographySchema),
  inbox: nullable(InboxSchema),
})

// ---------------------------------------------------------------------------- types

export type InlineLink = z.infer<typeof InlineLinkSchema>
export type InlineArticleRef = z.infer<typeof InlineArticleRefSchema>
export type InlineMark = z.infer<typeof InlineMarkSchema>
export type Inline = z.infer<typeof InlineSchema>
export type Inlines = Inline[]

export type ParagraphBlock = z.infer<typeof ParagraphBlockSchema>
export type HeadingBlock = z.infer<typeof HeadingBlockSchema>
export type FieldsBlock = z.infer<typeof FieldsBlockSchema>
export type BulletsBlock = z.infer<typeof BulletsBlockSchema>
export type TableBlock = z.infer<typeof TableBlockSchema>
export type QuoteBlock = z.infer<typeof QuoteBlockSchema>
export type FigureBlock = z.infer<typeof FigureBlockSchema>
export type SourceBlock = z.infer<typeof SourceBlockSchema>
export type Block = z.infer<typeof BlockSchema>

export type ArticleFile = z.infer<typeof ArticleFileSchema>
export type GlanceTile = z.infer<typeof GlanceTileSchema>
export type Section = z.infer<typeof SectionSchema>
export type ArticleView = z.infer<typeof ArticleViewSchema>
export type Notice = z.infer<typeof NoticeSchema>
export type ArticleCard = z.infer<typeof ArticleCardSchema>
export type Article = z.infer<typeof ArticleSchema>
export type BibliographyFields = z.infer<typeof BibliographyFieldsSchema>
export type HubTable = z.infer<typeof HubTableSchema>
export type Bibliography = z.infer<typeof BibliographySchema>
export type Triage = z.infer<typeof TriageSchema>
export type Prior = z.infer<typeof PriorSchema>
export type InboxPaper = z.infer<typeof InboxPaperSchema>
export type Inbox = z.infer<typeof InboxSchema>
export type Library = z.infer<typeof LibrarySchema>

// ---------------------------------------------------------------------------- views

/** An article's view once validated, or why there is none. */
export interface ReadView {
  view: ArticleView | null
  /** The record's own error (`glossator build` could not draw it), or what is wrong with its view. */
  error: string | null
}

const views = new WeakMap<Article, ReadView>()

/** The article's view, validated the first time it is asked for (then remembered). */
export function readArticleView(article: Article): ReadView {
  let read = views.get(article)
  if (read === undefined) {
    if (article.view === undefined || article.view === null) {
      read = { view: null, error: article.error ?? null }
    } else {
      const parsed = ArticleViewSchema.safeParse(article.view)
      read = parsed.success
        ? { view: parsed.data, error: null }
        : {
            view: null,
            error: `Its page does not follow the format this app reads: ${z
              .prettifyError(parsed.error)
              .split("\n")
              .slice(0, 6)
              .join(" ")}`,
          }
    }
    views.set(article, read)
  }
  return read
}

// ---------------------------------------------------------------------------- helpers

/** A retraction, withdrawal, removal or expression of concern: shown prominently. */
export function isSeriousNotice(notice: Notice): boolean {
  return (SERIOUS_NOTICE_TYPES as readonly string[]).includes(notice.type)
}

function isTagged(v: unknown): v is { t: string; [k: string]: unknown } {
  return typeof v === "object" && v !== null && typeof (v as { t?: unknown }).t === "string"
}
