/**
 * Page citations in an article's text ("p. 5", "pp. 13-14", "pp. 4-6, 9, 11") found so that each
 * becomes a page mark (a signe de renvoi): a page of the paper opens its PDF at that page; a page of
 * the supplementary information is marked "SI" (no PDF to open: the record does not say which file);
 * a page of any other document (the journal's own numbering, a review file, a preprint) stays text.
 */
import { pdfPageHref, resolveHref, type ArticleView } from "@/lib/data"

export interface PageRef {
  /** The text as written ("p. 5", "pp. 13-14", or a continued "9"). */
  text: string
  /** The first page it names. */
  page: number
  /** "SI" for a page of the supplementary information; absent for the paper's own PDF. */
  doc?: "SI"
}

export type PageRefPiece = string | PageRef

/** A citation "p." or "pp.", then a page or a range, not a section number like "3.4". */
const CITATION = /\b(pp?)\.\s?(\d{1,4})(?:\s?[-–]\s?(\d{1,4}))?(?![.,]?\d)/g
/** One more page or range of a "pp." list: ", 9" or ", 14-16". */
const CONTINUATION = /^,\s?(\d{1,4})(?:\s?[-–]\s?(\d{1,4}))?(?![.,]?\d)/

/** A clause naming the supplementary material: its pages are the SI's ("Tables S1-S3, pp. 1-5"). */
const SUPPLEMENT = /\b(supplementary|supplemental|supplement|suppl|SI|ESM)\b/i

/** Words that, just before a citation, say it names a page of another document. */
const ELSEWHERE = new Set([
  "supplementary",
  "supplemental",
  "supplement",
  "suppl",
  "si",
  "esm",
  "information",
  "file",
  "journal",
  "manuscript",
  "print",
  "printed",
  "arxiv",
])

/** The two words before a citation ("supplementary PDF", "Peer Review File"), lower case. */
const WORDS_BEFORE = /(?:([\p{L}]+)\.?[\s,(]+)?([\p{L}]+)\.?[\s,(]*$/u

type Where = "paper" | "SI" | "other"

/**
 * Where the clause of a citation starts: after the last ";" (sources list their places separated by
 * semicolons), ")" (an aside closed) or full stop.
 */
const CLAUSE_END = /[;)]|\.\s+(?=\p{Lu})/gu

/** Which document a citation names, from what comes before it in its clause. */
function whereCited(before: string): Where {
  let start = 0
  for (const m of before.matchAll(CLAUSE_END)) start = (m.index ?? 0) + m[0].length
  const clause = before.slice(start)
  if (SUPPLEMENT.test(clause)) return "SI"
  // The journal's numbering, a review file, a preprint: another document's pages. (An appendix is
  // the paper's own, in its PDF: its pages are the PDF's.)
  const m = WORDS_BEFORE.exec(clause.slice(-48))
  const near = m ? [m[1], m[2]] : []
  return near.some((w) => w !== undefined && ELSEWHERE.has(w.toLowerCase())) ? "other" : "paper"
}

function pageOf(digits: string): number | null {
  const n = Number(digits)
  return Number.isInteger(n) && n > 0 ? n : null
}

/**
 * Text cut into plain strings and page citations, in order; joined back they give the text. A page
 * of the supplementary information comes with `doc: "SI"`; a page of any other document stays text.
 */
export function splitPageRefs(text: string): PageRefPiece[] {
  const out: PageRefPiece[] = []
  let last = 0
  CITATION.lastIndex = 0
  for (let m = CITATION.exec(text); m !== null; m = CITATION.exec(text)) {
    const start = m.index
    const first = pageOf(m[2] ?? "")
    const where = first === null ? "other" : whereCited(text.slice(0, start))
    if (first === null || where === "other") continue
    const doc = where === "SI" ? ({ doc: "SI" } as const) : {}
    if (start > last) out.push(text.slice(last, start))
    out.push({ text: m[0], page: first, ...doc })
    let end = start + m[0].length
    // "pp. 4-6, 9, 11": the list goes on while the pages go up (", 2 sessions" is not a page).
    if (m[1] === "pp") {
      let previous = pageOf(m[3] ?? "") ?? first
      for (let c = CONTINUATION.exec(text.slice(end)); c !== null;) {
        const page = pageOf(c[1] ?? "")
        if (page === null || page <= previous) break
        const sep = c[0].slice(0, c[0].indexOf(c[1] ?? ""))
        out.push(sep, { text: c[0].slice(sep.length), page, ...doc })
        end += c[0].length
        previous = pageOf(c[2] ?? "") ?? page
        c = CONTINUATION.exec(text.slice(end))
      }
    }
    last = end
    CITATION.lastIndex = end
  }
  if (last < text.length) out.push(text.slice(last))
  return mergeStrings(out)
}

function mergeStrings(pieces: PageRefPiece[]): PageRefPiece[] {
  const out: PageRefPiece[] = []
  for (const p of pieces) {
    const prev = out[out.length - 1]
    if (typeof p === "string" && typeof prev === "string") out[out.length - 1] = prev + p
    else if (p !== "") out.push(p)
  }
  return out
}

/** The first page a text cites (the paper's first, else the SI's), or null. */
export function firstPageRef(text: string): PageRef | null {
  const refs = splitPageRefs(text).filter((p): p is PageRef => typeof p !== "string")
  return refs.find((r) => !r.doc) ?? refs[0] ?? null
}

/** "p. 5" → "5", "pp. 4-10" → "4-10": the page (or range) as `latexCite` and `quoteWithCitation` take it. */
export function pageArgument(ref: PageRef): string {
  return ref.text.replace(/^pp?\.\s?/, "")
}

/**
 * The article's own PDF as a served URL, or null when there is none to open: no primary file, a
 * file that is not a PDF, or one still to fetch (`glossator build` labels it "PDF · to fetch").
 */
export function paperPdfHref(view: Pick<ArticleView, "files">): string | null {
  const file = view.files.find((f) => f.primary)
  if (!file || /\bto fetch\s*$/i.test(file.label)) return null
  const link = resolveHref(file.href)
  return link?.kind === "file" && /\.pdf$/i.test(link.href) ? link.href : null
}

/**
 * Whether the record says the PDF is a manuscript (its pages are the PDF's, not the journal's): a
 * copied citation then says "PDF p. 5".
 */
export function pdfIsManuscript(view: Pick<ArticleView, "files">): boolean {
  const file = view.files.find((f) => f.primary)
  return file !== undefined && /\bmanuscript\b/i.test(file.label)
}

/** The PDF opened at a page: `/library/…/paper.pdf#page=5`. */
export function pageHref(pdf: string, page: number): string {
  return pdfPageHref(pdf, page)
}
