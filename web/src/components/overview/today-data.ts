/**
 * What Today shows, derived from the library: the bibliographies as a contents page, the inbox's
 * best papers of the moment, the most recently published articles, and the opening sentence that
 * says what changed. Pure functions (the sentence takes `now`), memoized per library where they walk
 * every article.
 */
import {
  isSeriousNotice,
  type ArticleEntry,
  type Bibliography,
  type Inbox,
  type InboxPaper,
  type InboxStatus,
  type LibraryIndex,
} from "@/lib/data"
import { formatShortDate, relativeDay } from "@/lib/format"
import { compareInboxPapers } from "@/lib/inbox-order"
import {
  defaultInboxView,
  latestRunDay,
  papersInView,
  type InboxView,
  type InboxViewCounts,
} from "@/lib/inbox-views"
import { noticeLabel } from "@/lib/labels"
import { routes } from "@/lib/routes"

// ---------------------------------------------------------------------------- the contents

/** Articles under one kind of notice (each article counted once, under its gravest notice). */
export interface NoticeCount {
  /** The notice's word, lower case: "retracted", "corrected", "expression of concern". */
  label: string
  count: number
  /** A retraction, withdrawal, removal or expression of concern (danger ink). */
  serious: boolean
  /** The article, when the count is one: the line can lead to it. */
  only: { key: string; cite: string } | null
}

/** A bibliography as Today's contents page lists it. */
export interface ContentsEntry {
  bib: Bibliography
  /** Every article, drafts included. */
  total: number
  /** Articles still being curated. */
  drafts: number
  /** Records that do not follow the format (the data carries an error instead of a view). */
  unreadable: number
  /** The years its articles were published in, or null when none says. */
  years: { from: number; to: number } | null
  /** Serious notices first, then the quiet ones, each most frequent first. */
  notices: NoticeCount[]
}

export function contentsEntry(bib: Bibliography): ContentsEntry {
  let from = Infinity
  let to = -Infinity
  let unreadable = 0
  const notices = new Map<string, NoticeCount>()
  for (const article of bib.articles) {
    if (article.year !== null) {
      from = Math.min(from, article.year)
      to = Math.max(to, article.year)
    }
    if (article.error !== undefined) unreadable += 1
    const gravest = article.notices.find(isSeriousNotice) ?? article.notices[0]
    if (!gravest) continue
    const label = noticeLabel(gravest).toLowerCase()
    const known = notices.get(label)
    if (known) {
      known.count += 1
      known.only = null
    } else {
      notices.set(label, {
        label,
        count: 1,
        serious: isSeriousNotice(gravest),
        only: { key: article.key, cite: article.cite },
      })
    }
  }
  const total = bib.articles.length
  return {
    bib,
    total,
    drafts: total - Math.min(bib.complete, total),
    unreadable,
    years: Number.isFinite(from) ? { from, to } : null,
    notices: [...notices.values()].sort(
      (a, b) => Number(b.serious) - Number(a.serious) || b.count - a.count
    ),
  }
}

/** "2009–2026", or "2024" when every article is of one year. */
export function yearSpan(years: ContentsEntry["years"]): string | null {
  if (!years) return null
  return years.from === years.to ? String(years.from) : `${years.from}–${years.to}`
}

// ---------------------------------------------------------------------------- recent articles

export interface YearGroup {
  /** null: articles without a year. */
  year: number | null
  entries: ArticleEntry[]
}

/**
 * The `limit` most recently published articles of every bibliography, grouped by year (newest
 * first). Within a year, each bibliography keeps its own order and bibliographies alternate, so one
 * large bibliography does not hide the others.
 */
export function recentArticles(lib: LibraryIndex, limit = 8): YearGroup[] {
  const byYear = new Map<number | null, ArticleEntry[][]>()
  for (const bib of lib.bibliographies) {
    for (const article of bib.articles) {
      const entry = lib.article(bib.name, article.key)
      if (!entry) continue
      const lanes = byYear.get(article.year) ?? []
      byYear.set(article.year, lanes)
      let lane = lanes.find((l) => l[0]?.bib.name === bib.name)
      if (!lane) {
        lane = []
        lanes.push(lane)
      }
      lane.push(entry)
    }
  }
  const years = [...byYear.keys()].sort((a, b) => (b ?? -Infinity) - (a ?? -Infinity))
  const groups: YearGroup[] = []
  let left = limit
  for (const year of years) {
    if (left <= 0) break
    const entries = interleave(byYear.get(year) ?? []).slice(0, left)
    left -= entries.length
    groups.push({ year, entries })
  }
  return groups
}

function interleave<T>(lanes: readonly T[][]): T[] {
  const out: T[] = []
  const longest = Math.max(0, ...lanes.map((l) => l.length))
  for (let i = 0; i < longest; i++) {
    for (const lane of lanes) {
      const item = lane[i]
      if (item !== undefined) out.push(item)
    }
  }
  return out
}

// ---------------------------------------------------------------------------- per library

export interface LibraryDigest {
  contents: ContentsEntry[]
  /** Every article of every bibliography. */
  articles: number
  recent: YearGroup[]
}

const cache = new WeakMap<LibraryIndex, LibraryDigest>()

/** The library's side of Today (the inbox's changes with each decision: `inboxDigest`). */
export function libraryDigest(lib: LibraryIndex): LibraryDigest {
  const hit = cache.get(lib)
  if (hit) return hit
  const contents = lib.bibliographies.map(contentsEntry)
  const digest: LibraryDigest = {
    contents,
    articles: contents.reduce((n, e) => n + e.total, 0),
    recent: recentArticles(lib),
  }
  cache.set(lib, digest)
  return digest
}

// ---------------------------------------------------------------------------- the inbox

/** How many papers Today lists from the inbox. */
export const TODAY_PAPERS = 5

export interface InboxDigest {
  /** The view the list shows (the inbox's own default, else All waiting); null: nothing waits. */
  view: InboxView | null
  /** Its best papers (relevance, then the prior), at most `TODAY_PAPERS`. */
  papers: InboxPaper[]
  /** How many papers the view holds. */
  inView: number
}

/**
 * The inbox's best papers of the moment: those of the view the inbox opens on (New while the latest
 * run brought undecided papers, else Worth a look), or of All waiting when nothing is worth a look.
 */
export function inboxDigest(
  inbox: Inbox | null,
  counts: InboxViewCounts,
  status: (paper: InboxPaper) => InboxStatus = (p) => p.status
): InboxDigest {
  if (!inbox || counts.waiting === 0) return { view: null, papers: [], inView: 0 }
  let view = defaultInboxView(counts)
  if (counts[view] === 0) view = "waiting"
  const papers = papersInView(inbox, view, status).toSorted(compareInboxPapers)
  return { view, papers: papers.slice(0, TODAY_PAPERS), inView: counts[view] }
}

// ---------------------------------------------------------------------------- the sentence

/** A link in the sentence: its figure (drawn apart: the new count is rubric) and its words. */
export interface SentenceLink {
  href: string
  figure: string
  words: string
  /** The new papers: the figure in rubric, the words in semibold. */
  news?: boolean
}

export type SentencePart = string | SentenceLink

const WORDS = [
  "No",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
  "Twenty",
]

/** A count opening a sentence: in words up to twenty ("Four"), else in figures. */
export function sentenceNumber(n: number): string {
  return WORDS[n] ?? n.toLocaleString("en")
}

function figure(n: number): string {
  return n.toLocaleString("en")
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many
}

/**
 * When the latest run happened, to open a clause: "This morning", "This afternoon", "This
 * evening", "Today" (a day without a time), "Yesterday", "On 5 Nov".
 */
export function runWhen(lastRun: string, day: string, now: Date): string {
  const relative = relativeDay(day, now)
  if (relative === "yesterday") return "Yesterday"
  if (relative === "today") {
    const time = new RegExp(`^${day}T(\\d{2}):`).exec(lastRun)
    if (!time) return "Today"
    const hour = Number(time[1])
    return hour < 12 ? "This morning" : hour < 18 ? "This afternoon" : "This evening"
  }
  return `On ${formatShortDate(day, now)}`
}

export interface SentenceInput {
  bibliographies: number
  articles: number
  inbox: Pick<Inbox, "last_run" | "papers"> | null
  counts: InboxViewCounts
  now: Date
}

/**
 * Today's opening sentence, as text and links: "Four bibliographies, 62 articles. This morning the
 * inbox found 26 new papers; 182 wait, 11 of them in scope." The wording follows the data: no
 * bibliography yet, no inbox, no run yet, nothing new, nothing waiting, one paper, accepted papers to
 * add.
 */
export function todaySentence({
  bibliographies,
  articles,
  inbox,
  counts,
  now,
}: SentenceInput): SentencePart[] {
  const parts: SentencePart[] = []
  if (bibliographies === 0) parts.push("No bibliography yet.")
  else
    parts.push(
      `${sentenceNumber(bibliographies)} ${plural(bibliographies, "bibliography", "bibliographies")}, ${
        articles === 0
          ? "no article yet"
          : `${figure(articles)} ${plural(articles, "article", "articles")}`
      }.`
    )
  if (!inbox) return parts

  const day = latestRunDay(inbox)
  const inScope: SentencePart[] =
    counts.inScope > 0
      ? [
          ", ",
          {
            // No view holds them alone: Worth a look (relevance 2 or 3) lists them first.
            href: routes.inbox({ view: "worth" }),
            figure: figure(counts.inScope),
            words: "of them in scope",
          },
        ]
      : [", none in scope"]

  if (day === null) {
    parts.push(" The inbox has not run yet.")
  } else {
    const when = runWhen(inbox.last_run, day, now)
    if (counts.new > 0) {
      parts.push(` ${when} the inbox found `, {
        href: routes.inbox({ view: "new" }),
        figure: figure(counts.new),
        words: plural(counts.new, "new paper", "new papers"),
        news: true,
      })
      if (counts.waiting > counts.new) parts.push(`; ${figure(counts.waiting)} wait`, ...inScope)
      else if (counts.inScope > 0) parts.push(...inScope)
      parts.push(".")
    } else if (counts.waiting > 0) {
      parts.push(
        ` ${when} the inbox found nothing new; `,
        {
          href: routes.inbox({ view: "waiting" }),
          figure: figure(counts.waiting),
          words: plural(counts.waiting, "paper waits", "papers wait"),
        },
        ...inScope,
        "."
      )
    } else {
      parts.push(` ${when} the inbox found nothing new, and nothing waits for a decision.`)
    }
  }

  if (counts.accepted > 0) {
    parts.push(" ", {
      href: routes.inbox({ view: "accepted" }),
      figure: sentenceNumber(counts.accepted),
      words: plural(counts.accepted, "accepted paper waits", "accepted papers wait"),
    })
    parts.push(" to be added.")
  }
  return parts
}
