/**
 * Citing an article: its reference ("Jumper, J. et al. Highly accurate protein structure
 * prediction with AlphaFold. Nature 596, 583–589 (2021)."), a BibTeX entry built from its card, a LaTeX
 * \cite at a place in it, and a quote with its citation. Pure helpers: the Cite menu and the copy
 * controls (`@/components/content/cite-menu`, `copy-button`) draw them.
 *
 * **Pages.** A place is a page of the article's PDF or of a supplementary file; one rule for it
 * everywhere (`citePlace`):
 * - the PDF published, its journal page known (`journal_offset`): the journal page,
 *   `\cite[p.~585]{key}`, "(Jumper et al. 2021, p. 585)";
 * - a manuscript (accepted or submitted version): `\cite{key} % manuscript p. 2`, "(…, manuscript p. 2)";
 * - otherwise (published, the offset unknown): `\cite{key} % PDF p. 2`, "(…, PDF p. 2)";
 * - a supplementary file names itself: `\cite[SI~1, p.~15]{key}`, "(…, SI 1, p. 15)".
 */
import type { ArticleCard } from "./data/schema"
import { shortVenue } from "./format"

/** The fields of a full reference: optional (a card built by hand, data written before them). */
type ReferenceFields = "authors_full" | "volume" | "issue" | "pages" | "version" | "journal_offset"

/** What citing needs of an article's card. */
export type CiteCard = Pick<
  ArticleCard,
  "key" | "cite" | "title" | "authors" | "year" | "venue" | "doi"
> &
  Partial<Pick<ArticleCard, ReferenceFields>>

/** A formatted reference in parts: who and when (`lead`), and where (`venue`, set in italic). */
export interface ReferenceParts {
  /** The surnames as the cite gives them: ["Novak", "Ito"], or ["Lindqvist"] with `etAl`. */
  names: string[]
  etAl: boolean
  /** "2024", "2024b", or "" when unknown. */
  year: string
  /** "Novak & Ito 2024", "Lindqvist et al. 2026". */
  lead: string
  /** The venue as the cite abbreviates it, else the card's venue shortened; "" when none. */
  venue: string
}

/** "Name et al. 2024, Venue": the cite `glossator build` writes. */
const CITE = /^(.+?)\s+((?:1[5-9]|20)\d{2}[a-z]?|n\.d\.)(?:,\s*(.+))?$/u

/** A reference's parts, from the card's cite (else its authors, year and venue). */
export function referenceParts(card: CiteCard): ReferenceParts {
  const m = CITE.exec(card.cite.trim())
  if (m) {
    const who = (m[1] ?? "").trim()
    const etAl = /\s+et al\.?$/u.test(who)
    const names = who
      .replace(/\s+et al\.?$/u, "")
      .split(/\s+(?:&|and)\s+/u)
      .map((n) => n.trim())
      .filter(Boolean)
    const year = m[2] ?? ""
    return {
      names,
      etAl,
      year,
      lead: who ? `${who} ${year}` : year,
      venue: shortVenue(m[3] ?? "") || shortVenue(card.venue),
    }
  }
  const all = authorNames(card)
  const surnames = all.names.map((n) => splitName(n).family)
  const etAl = surnames.length > 2 || all.truncated
  const names = etAl ? surnames.slice(0, 1) : surnames
  const year = card.year === null ? "" : String(card.year)
  const who = names.length === 0 ? "" : etAl ? `${names[0]} et al.` : names.join(" & ")
  const lead = [who, year].filter(Boolean).join(" ") || card.cite.trim() || card.key
  return { names, etAl, year, lead, venue: shortVenue(card.venue) }
}

/** The reference's parts in Nature's style, the venue apart so a renderer sets it in italic. */
export interface FullReference {
  /** "Jumper, J., Evans, R. & Pritzel, A." (up to five), "Jumper, J. et al." beyond; "" none. */
  authors: string
  /** The title with its stop ("Highly accurate protein structure prediction with AlphaFold."); "" when none. */
  title: string
  /** The journal as the data names it (shortened: no database parenthesis); "" when none. */
  venue: string
  /** What follows the venue: " 596, 583–589 (2021)." (" (2021)." without a volume). */
  tail: string
}

/** "Jumper, J. et al. Highly accurate protein structure prediction with AlphaFold. Nature 596, 583–589 (2021)." */
export function fullReference(card: CiteCard): FullReference {
  const { names, truncated } = authorNames(card)
  const listed = names.map(initialled)
  const authors =
    listed.length === 0
      ? ""
      : truncated || listed.length > 5
        ? `${listed[0]} et al.`
        : listed.length === 1
          ? withStop(listed[0]!)
          : withStop(`${listed.slice(0, -1).join(", ")} & ${listed.at(-1)}`)
  const title = card.title.trim() ? withStop(card.title.trim()) : ""
  const venue = shortVenue(card.venue)
  const year = card.year === null ? referenceParts(card).year : String(card.year)
  const volume = venue ? (card.volume ?? "").trim() : ""
  const pages = venue ? (card.pages ?? "").trim().replace(/\s*[-–—]+\s*/gu, "–") : ""
  const where = [volume, pages].filter(Boolean).join(", ")
  const tail = `${where ? ` ${where}` : ""}${year ? ` (${year})` : ""}.`
  return { authors, title, venue, tail }
}

/** The full reference as one line of text (the Cite menu's "Reference"); the cite without data. */
export function formatReference(card: CiteCard): string {
  const { authors, title, venue, tail } = fullReference(card)
  if (!authors && !title) return card.cite.trim() || card.key
  const head = [authors, title].filter(Boolean).join(" ")
  // Without a venue the year follows the title: "Mendes, A. A title (2023)."
  return venue ? `${head} ${venue}${tail}` : `${head.replace(/\.$/u, "")}${tail}`
}

// ---------------------------------------------------------------------------- places and pages

/** Where in the article a citation points. */
export interface CitePlace {
  /** The page in its file (5, "5", "4–10", "S3"): a page of the PDF, never the journal's. */
  page: number | string
  /**
   * A supplementary file, by the label the record gives it ("SI 1", "Supplementary data 2"; "" for
   * one without a label). Absent: the article's own PDF.
   */
  file?: string
}

/** A place in words and in LaTeX: "p. 585" and `\cite[p.~585]{key}`, "PDF p. 2" and `\cite{key} % PDF p. 2`. */
export interface CitedPlace {
  /** What follows the reference's lead: "p. 585", "manuscript p. 2", "SI 1, p. 15"; "" for none. */
  words: string
  /** The LaTeX citation, its comment included. */
  latex: string
}

/** Whether the article's PDF is a manuscript (its pages are not the journal's). */
export function isManuscript(card: CiteCard): boolean {
  return card.version === "acceptedVersion" || card.version === "submittedVersion"
}

/** A place by the one rule (see the module's comment); `\cite{key}` and "" without a place. */
export function citePlace(card: CiteCard, place?: CitePlace | null): CitedPlace {
  const key = card.key
  const page = place ? cleanPage(place.page) : ""
  if (!place || !page) return { words: "", latex: `\\cite{${key}}` }
  if (place.file !== undefined) {
    // "SI 1, p. 15", "Supplementary data 2, p. 3"; a bare abbreviation without the comma: "SI p. 15".
    const file = place.file.trim() || "suppl."
    const sep = /\d$|\s/u.test(file) ? ", " : " "
    return {
      words: `${file}${sep}${pageLabel(page)}`,
      latex: `\\cite[${file.replace(/ /gu, "~")}${sep === " " ? "~" : sep}${pageLabel(page, { latex: true })}]{${key}}`,
    }
  }
  if (isManuscript(card)) {
    const words = `manuscript ${pageLabel(page)}`
    return { words, latex: `\\cite{${key}} % ${words}` }
  }
  const journal = card.journal_offset == null ? null : shiftPage(page, card.journal_offset)
  if (journal !== null) {
    return {
      words: pageLabel(journal),
      latex: `\\cite[${pageLabel(journal, { latex: true })}]{${key}}`,
    }
  }
  const words = `PDF ${pageLabel(page)}`
  return { words, latex: `\\cite{${key}} % ${words}` }
}

/**
 * `\cite{key}`, or `\cite[p.~5]{key}` / `\cite[pp.~4--10]{key}` with a page that is already the one
 * to print (the journal's). For a place in the article, `citePlace(card, place).latex`.
 */
export function latexCite(key: string, page?: number | string | null): string {
  const where = pageLabel(page, { latex: true })
  return where ? `\\cite[${where}]{${key}}` : `\\cite{${key}}`
}

/** Words with their citation: `“the words” (Novak & Ito 2024, p. 5)`; `quote: false` leaves them bare. */
export function quoteWithCitation(
  quote: string,
  card: CiteCard,
  place?: CitePlace | null,
  { quote: marks = true }: { quote?: boolean } = {}
): string {
  const words = marks ? `“${unquote(quote.trim())}”` : quote.trim()
  const at = citePlace(card, place).words
  return `${words} (${referenceParts(card).lead}${at ? `, ${at}` : ""})`
}

/**
 * The card as a BibTeX entry: @article (a journal), @inproceedings (proceedings, a conference),
 * @misc (a preprint server, or no venue). Authors "Family, Given and …", "and others" when the list
 * was cut; the title in double braces (its capitals kept); special characters escaped.
 */
export function bibtex(card: CiteCard): string {
  const { names, truncated } = authorNames(card)
  const authors = [...names.map(bibtexName), ...(truncated ? ["others"] : [])].join(" and ")
  const venue = card.venue.trim()
  const kind = entryKind(venue)
  const year = card.year === null ? referenceParts(card).year : String(card.year)
  const fields: [string, string][] = [
    ["author", authors],
    ["title", card.title.trim() ? `{${escapeLatex(card.title.trim())}}` : ""],
    [
      kind === "article" ? "journal" : kind === "inproceedings" ? "booktitle" : "howpublished",
      escapeLatex(kind === "misc" ? shortVenue(venue) : venue),
    ],
    ["year", year],
    ["volume", escapeLatex((card.volume ?? "").trim())],
    ["number", escapeLatex((card.issue ?? "").trim())],
    ["pages", (card.pages ?? "").trim().replace(/\s*[-–—]+\s*/gu, "--")],
    ["doi", card.doi.trim()],
  ]
  const body = fields
    .filter(([, value]) => value !== "")
    .map(([name, value]) => `  ${name} = {${value}},`)
    .join("\n")
  return `@${kind}{${card.key},\n${body}\n}`
}

// ---------------------------------------------------------------------------- helpers

/** Every author when the card has them (`authors_full`), else its short line read. */
function authorNames(card: CiteCard): { names: string[]; truncated: boolean } {
  const full = (card.authors_full ?? []).map((n) => n.trim()).filter(Boolean)
  return full.length ? { names: full, truncated: false } : parseAuthors(card.authors)
}

/** "Ingrid M. Lindqvist" -> "Lindqvist, I. M."; "Jean-Luc Picard" -> "Picard, J.-L."; a group as is. */
function initialled(name: string): string {
  if (CORPORATE.test(name)) return name
  const { family, given } = splitName(name)
  if (!given) return family
  const initials = given
    .split(/\s+/u)
    .map((part) =>
      part
        .split("-")
        .map((p) => (p.endsWith(".") && p.length <= 3 ? p : `${[...p][0] ?? ""}.`))
        .join("-")
    )
    .join(" ")
  return `${family}, ${initials}`
}

/** A sentence's stop, unless it ends with one ("?", "!", "." or "…"). */
function withStop(text: string): string {
  return /[.?!…]$/u.test(text) ? text : `${text}.`
}

/** "5", "4–10", "S3": the page as written, without "p." or "pp.". */
function cleanPage(page: number | string): string {
  return String(page)
    .trim()
    .replace(/^pp?\.\s*/u, "")
}

/** A PDF page (or range) moved to the journal's by `offset`; null when it is not a number. */
function shiftPage(page: string, offset: number): string | null {
  const range = /^(\d+)\s*[-–—]+\s*(\d+)$/u.exec(page)
  if (range) return `${Number(range[1]) + offset}–${Number(range[2]) + offset}`
  return /^\d+$/u.test(page) ? String(Number(page) + offset) : null
}

/** An author list as the data writes it: "A B, C D, … , Y Z (12 authors)". */
export function parseAuthors(authors: string): { names: string[]; truncated: boolean } {
  const list = authors
    .replace(/\s*\(\d+\s+authors?\)\s*$/u, "")
    .split(/\s*,\s*/u)
    .map((n) => n.trim())
    .filter(Boolean)
  const cut = list.findIndex((n) => n === "…" || n === "...")
  // After the ellipsis come the last authors: BibTeX's "and others" stands for all of them.
  return cut < 0
    ? { names: list, truncated: false }
    : { names: list.slice(0, cut), truncated: true }
}

const PARTICLES = new Set([
  "da",
  "das",
  "de",
  "del",
  "della",
  "der",
  "di",
  "do",
  "dos",
  "du",
  "la",
  "le",
  "ten",
  "ter",
  "van",
  "von",
])

const CORPORATE = /\b(?:consortium|group|collaboration|team|network|initiative|investigators)\b/iu

/** "Petra Novák" -> family "Novák", given "Petra"; "Anna van der Berg" -> "van der Berg", "Anna". */
export function splitName(name: string): { family: string; given: string } {
  const tokens = name.trim().split(/\s+/u)
  if (tokens.length < 2) return { family: tokens[0] ?? "", given: "" }
  const particle = tokens.findIndex((t, i) => i > 0 && PARTICLES.has(t))
  const at = particle > 0 && particle < tokens.length - 1 ? particle : tokens.length - 1
  return { family: tokens.slice(at).join(" "), given: tokens.slice(0, at).join(" ") }
}

function bibtexName(name: string): string {
  if (CORPORATE.test(name)) return `{${escapeLatex(name)}}`
  const { family, given } = splitName(name)
  return given ? `${escapeLatex(family)}, ${escapeLatex(given)}` : escapeLatex(family)
}

function entryKind(venue: string): "article" | "inproceedings" | "misc" {
  if (!venue) return "misc"
  if (
    /\b(?:arxiv|biorxiv|medrxiv|chemrxiv|psyarxiv|research square|preprints?|ssrn|zenodo|osf)\b/iu.test(
      venue
    )
  )
    return "misc"
  if (/\b(?:proceedings|proc\.|conference|symposium|workshop)\b/iu.test(venue))
    return "inproceedings"
  return "article"
}

/** LaTeX's special characters, escaped (Unicode letters stay: biber and modern BibTeX read UTF-8). */
export function escapeLatex(text: string): string {
  return text.replace(/[\\{}&%$#_~^]/gu, (c) => {
    switch (c) {
      case "\\":
        return "\\textbackslash{}"
      case "~":
        return "\\textasciitilde{}"
      case "^":
        return "\\textasciicircum{}"
      default:
        return `\\${c}`
    }
  })
}

/** "p. 5", "pp. 4–10" (LaTeX: "p.~5", "pp.~4--10"), or "" without a page. */
function pageLabel(page: number | string | null | undefined, { latex = false } = {}): string {
  if (page === null || page === undefined) return ""
  const text = String(page)
    .trim()
    .replace(/^pp?\.\s*/u, "")
  if (!text) return ""
  const range = /^(\w+)\s*[-–—]+\s*(\w+)$/u.exec(text)
  const space = latex ? "~" : " "
  if (range) return `pp.${space}${range[1]}${latex ? "--" : "–"}${range[2]}`
  return `p.${space}${text}`
}

function unquote(text: string): string {
  const m = /^[“"‘'\u00AB]\s*([\s\S]*?)\s*[”"’'\u00BB]$/u.exec(text)
  return m?.[1] ?? text
}
