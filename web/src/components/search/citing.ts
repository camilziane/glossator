/**
 * What the search copies for a passage: its LaTeX citation at the passage's page (`c`), and the
 * passage with its citation (`y`). The page follows the app's one rule (`citePlace`, @/lib/cite):
 * the journal page when the record knows it, else the manuscript's or the PDF's page said as such;
 * a supplementary file names itself ("SI 1, p. 15").
 */
import type { SearchHit } from "@/lib/api"
import { citePlace, quoteWithCitation, referenceParts, type CiteCard } from "@/lib/cite"
import { recordField } from "@/lib/data"
import { typeset } from "@/lib/typeset"

import type { HitPlace } from "./hits"
import { parseRecordSnippet, quoteSentences, tidySnippet } from "./snippet"

/** `\cite[p.~585]{key}`, `\cite{key} % PDF p. 4`, `\cite[SI~1, p.~2]{key}`; `\cite{key}` without a page. */
export function citeForHit(card: CiteCard, place: HitPlace): string {
  return citePlace(card, place.cite).latex
}

/** A summary's passage as one line of plain text: its parts joined as clauses, no field names. */
function recordWords(hit: SearchHit, place: HitPlace): string {
  const m = place.metric
  if (m) {
    const condition = m.condition && !/^not (?:reported|applicable)$/i.test(m.condition)
    return [
      m.name && m.value ? `${m.name}: ${m.value}` : m.name || m.value,
      condition ? m.condition : "",
    ]
      .filter(Boolean)
      .join("; ")
  }
  const { parts } = parseRecordSnippet(hit.snippet, recordField(hit.source))
  // "; " between parts, unless a part ends its own sentence.
  return parts
    .map((p) => p.text)
    .reduce((all, t) => (!all ? t : /[.;:!?…]$/.test(all) ? `${all} ${t}` : `${all}; ${t}`), "")
}

/**
 * The words a passage gives to a quote: the whole sentences of the passage (`passage`, its text as
 * the reader shows it) that hold the snippet, never the index's cut; the snippet itself, its
 * ellipses dropped, until the passage is read. A summary's passage: its labelled parts' words.
 */
export function passageWords(hit: SearchHit, place: HitPlace, passage?: string | null): string {
  if (place.kind === "record") return recordWords(hit, place)
  return (passage ? quoteSentences(passage, hit.snippet) : null) ?? tidySnippet(hit.snippet).text
}

/**
 * The passage (or the words the reader selected in it) with its citation, typeset: a quote of the
 * paper `“…” (Lindqvist et al. 2026, p. 214)`, of a supplementary file `“…” (Novak & Ito 2024, SI 1,
 * p. 2)`; a referee's words are said to be one ("Referee comment on Novak & Ito 2024 (Peer review
 * file, p. 3): “…”"), never quoted as the paper's; a summary's line is the curator's words: no
 * quote marks. Quotes inside a quote turn single.
 */
export function passageWithCitation(
  hit: SearchHit,
  place: HitPlace,
  card: CiteCard,
  { selected, passage }: { selected?: string; passage?: string | null } = {}
): string {
  const plain = typeset(
    (selected?.trim() || passageWords(hit, place, passage)).replace(/\s+/g, " ")
  )
  if (place.kind === "record") return quoteWithCitation(plain, card, place.cite, { quote: false })
  const words = plain.replace(/“/g, "‘").replace(/”/g, "’")
  if (place.review) {
    const where = citePlace(card, place.cite).words
    return `Referee comment on ${referenceParts(card).lead}${where ? ` (${where})` : ""}: “${words}”`
  }
  return quoteWithCitation(words, card, place.cite)
}
