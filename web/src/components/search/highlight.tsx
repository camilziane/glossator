import { Fragment, type ReactNode } from "react"

import { foldText } from "@/lib/data"
import { typesetParts, type TypesetLang, type TypesetPart } from "@/lib/typeset"
import { cn } from "@/lib/utils"

/**
 * Highlighting of search terms in plain text, as React elements (never HTML): accent- and
 * case-insensitive ("uber" marks "Über"), matched at the start of a word, the whole
 * word marked (a prefix search for "sensor" marks "sensors", never "ensor").
 */

/**
 * Small words a reader types between the ones that matter, in English and a few other languages of
 * the papers: never highlighted on their own.
 */
const STOP_WORDS: ReadonlySet<string> = new Set(
  (
    "a an and are as at be by for from in into is it of on or than that the their this to was were with " +
    "der die das den dem des ein eine und im mit von zu " +
    "el la los las un una del de y en por para con " +
    "le les du et au aux sur ou"
  ).split(" ")
)

const WORD = /[\p{L}\p{N}]+(?:[-.'’/][\p{L}\p{N}]+)*/gu

/**
 * The terms of what a person typed, folded, for highlighting: "quoted phrases" whole, then the other
 * words without the small ones (unless only small ones were typed). Longest first.
 */
export function queryTerms(query: string): string[] {
  const phrases = [...query.matchAll(/"([^"]+)"/g)]
    .map((m) => foldText(m[1] ?? "").trim())
    .filter(Boolean)
  const rest = query.replace(/"[^"]*"/g, " ")
  const words = foldText(rest).match(WORD) ?? []
  const meaningful = words.filter((w) => !STOP_WORDS.has(w) && (w.length > 1 || /\d/.test(w)))
  const terms = [...phrases, ...(meaningful.length > 0 ? meaningful : words)]
  return [...new Set(terms)].sort((a, b) => b.length - a.length)
}

export interface MatchRange {
  start: number
  end: number
  /** How many words of the query the range holds: 2 or more is a phrase found whole. */
  words: number
}

interface Folded {
  text: string
  /** For each UTF-16 unit of the folded text: where its character starts and ends in the original. */
  starts: number[]
  ends: number[]
}

function fold(text: string): Folded {
  // Plain ASCII folds to its lower case, unit for unit.
  if (/^[\x00-\x7f]*$/.test(text)) {
    const starts = Array.from(text, (_, i) => i)
    return { text: text.toLowerCase(), starts, ends: starts.map((i) => i + 1) }
  }
  let out = ""
  const starts: number[] = []
  const ends: number[] = []
  let i = 0
  for (const ch of text) {
    const f = foldText(ch)
    for (let j = 0; j < f.length; j++) {
      starts.push(i)
      ends.push(i + ch.length)
    }
    out += f
    i += ch.length
  }
  return { text: out, starts, ends }
}

const WORD_CHAR = /[\p{L}\p{N}]/u

/** Words between two marks that do not break a phrase ("rate of the model"). */
function onlySpace(between: string): boolean {
  return !between.trim()
}

/** The words of `text` that `terms` (folded, from queryTerms or a search index) start, merged. */
export function matchRanges(text: string, terms: readonly string[]): MatchRange[] {
  const wanted = terms.map((t) => foldText(t).trim()).filter(Boolean)
  if (!text || wanted.length === 0) return []
  const folded = fold(text)
  const found: MatchRange[] = []
  for (const term of wanted) {
    const words = term.split(/\s+/).length
    let at = folded.text.indexOf(term)
    while (at !== -1) {
      const before = at > 0 ? folded.text[at - 1] : ""
      if (!before || !WORD_CHAR.test(before)) {
        // A prefix marks its whole word: "sensor" marks "sensors".
        let last = at + term.length - 1
        while (last + 1 < folded.text.length && WORD_CHAR.test(folded.text[last + 1] ?? "")) last++
        const start = folded.starts[at]
        const end = folded.ends[last]
        if (start !== undefined && end !== undefined) found.push({ start, end, words })
      }
      at = folded.text.indexOf(term, at + 1)
    }
  }
  found.sort((a, b) => a.start - b.start || b.end - a.end)
  const merged: MatchRange[] = []
  for (const r of found) {
    const last = merged.at(-1)
    if (last && r.start < last.end) {
      // Overlapping terms ("toy filter" inside "toy filter taps"): one mark.
      if (r.end > last.end) last.end = r.end
      last.words = Math.max(last.words, r.words)
    } else if (last && onlySpace(text.slice(last.end, r.start))) {
      // Words marked one after the other read as one mark ("closed loop", not "closed" "loop").
      last.end = r.end
      last.words += r.words
    } else merged.push({ ...r })
  }
  return merged
}

/**
 * Whether a match is drawn strong (the full highlighter) or light: with `grade`, a match of one word
 * among several typed is light, a phrase found whole is strong; a query of one word is strong.
 */
function isStrong(range: MatchRange, terms: readonly string[], grade: boolean): boolean {
  if (!grade) return true
  const typed = terms.reduce((n, t) => n + t.split(/\s+/).length, 0)
  return typed <= 1 || range.words >= 2
}

/** A light match: a thinner, paler stroke (ink on it keeps its contrast: it only gets paler). */
const LIGHT = "[box-shadow:inset_0_-0.3em_0_color-mix(in_oklab,var(--highlight)_70%,transparent)]"

function Mark({ strong, children }: { strong: boolean; children: ReactNode }) {
  return (
    <mark data-match={strong ? "strong" : "light"} className={cn(!strong && LIGHT)}>
      {children}
    </mark>
  )
}

/** `text` with every match of `terms` in a <mark>; `grade`: single words lighter than phrases. */
export function Highlight({
  text,
  terms,
  grade = false,
}: {
  text: string
  terms: readonly string[]
  grade?: boolean
}): ReactNode {
  const ranges = matchRanges(text, terms)
  if (ranges.length === 0) return text
  const out: ReactNode[] = []
  let at = 0
  for (const range of ranges) {
    const { start, end } = range
    if (start > at) out.push(<Fragment key={`t${at}`}>{text.slice(at, start)}</Fragment>)
    out.push(
      <Mark key={`m${start}`} strong={isStrong(range, terms, grade)}>
        {text.slice(start, end)}
      </Mark>
    )
    at = end
  }
  if (at < text.length) out.push(<Fragment key={`t${at}`}>{text.slice(at)}</Fragment>)
  return out
}

function partText(part: TypesetPart): string {
  return typeof part === "string" ? part : part.text
}

function wrapPart(part: TypesetPart, children: ReactNode, key: string): ReactNode {
  if (typeof part === "string") return <Fragment key={key}>{children}</Fragment>
  switch (part.t) {
    case "abbr":
      return (
        <abbr key={key} className="ac">
          {children}
        </abbr>
      )
    case "sup":
      return <sup key={key}>{children}</sup>
    case "muted":
      return (
        <span key={key} className="text-muted-foreground">
          {children}
        </span>
      )
  }
}

/**
 * Text from the data, typeset for the page (`typesetParts`: quotes, dashes, no-break spaces, small-
 * caps acronyms in serif text) and its matches marked. The matches are found on the typeset text,
 * so a phrase across an acronym is still one phrase.
 */
export function MarkedText({
  text,
  terms,
  grade = false,
  lang,
  acronyms = false,
}: {
  text: string
  terms: readonly string[]
  /** Single words lighter than phrases (the search's passages). */
  grade?: boolean
  lang?: TypesetLang | null
  /** Small-caps acronyms: serif text only. */
  acronyms?: boolean
}): ReactNode {
  const parts = typesetParts(text, { lang, acronyms })
  const whole = parts.map(partText).join("")
  const ranges = matchRanges(whole, terms)
  const out: ReactNode[] = []
  let offset = 0
  parts.forEach((part, p) => {
    const t = partText(part)
    const from = offset
    const to = offset + t.length
    offset = to
    const pieces: ReactNode[] = []
    let at = from
    for (const range of ranges) {
      if (range.end <= from || range.start >= to) continue
      const s = Math.max(range.start, from)
      const e = Math.min(range.end, to)
      if (s > at) pieces.push(<Fragment key={`t${at}`}>{whole.slice(at, s)}</Fragment>)
      pieces.push(
        <Mark key={`m${s}`} strong={isStrong(range, terms, grade)}>
          {whole.slice(s, e)}
        </Mark>
      )
      at = e
    }
    if (at < to) pieces.push(<Fragment key={`t${at}`}>{whole.slice(at, to)}</Fragment>)
    out.push(wrapPart(part, pieces, `p${p}`))
  })
  return out
}
