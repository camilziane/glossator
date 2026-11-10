/**
 * Searches to try on the empty search page (no recent search yet): the pairs of words the library's
 * titles share most, so the examples speak of this library and nothing else.
 */
import type { LibraryIndex } from "@/lib/data"

/** Words that make no subject: articles, prepositions, and the words every title may use. */
const STOP: ReadonlySet<string> = new Set(
  (
    "a an and are as at be by for from in into is it its of on or the their this to with without via " +
    "using use used based towards toward new novel study studies analysis approach approaches method " +
    "methods case report review systematic evidence effect effects role than vs versus during after " +
    "between across within over under two three one first how what why when"
  ).split(" ")
)

const WORD = /[\p{L}][\p{L}\p{N}]*(?:-[\p{L}\p{N}]+)*/gu

/** A title's words, lower case, null where a small word or a stop stood (a pair never spans one). */
function words(title: string): (string | null)[] {
  return title
    .toLowerCase()
    .split(/[,:;.!?()[\]|"“”‘’–—]+/u)
    .flatMap((chunk) => [
      ...(chunk.match(WORD) ?? []).map((w) => (STOP.has(w) || w.length < 3 ? null : w)),
      null,
    ])
}

/**
 * Up to `count` searches built from the titles: the word pairs most titles hold (two titles at least),
 * each bringing new words; then single words, if pairs are too few. Deterministic.
 */
export function exampleQueries(lib: LibraryIndex, count = 3): string[] {
  const pairs = new Map<string, number>()
  const singles = new Map<string, number>()
  for (const { article } of lib.articles) {
    const ws = words(article.title)
    const seenPairs = new Set<string>()
    const seenWords = new Set<string>()
    ws.forEach((w, i) => {
      if (!w) return
      seenWords.add(w)
      const next = ws[i + 1]
      if (next) seenPairs.add(`${w} ${next}`)
    })
    for (const p of seenPairs) pairs.set(p, (pairs.get(p) ?? 0) + 1)
    for (const w of seenWords) singles.set(w, (singles.get(w) ?? 0) + 1)
  }
  const ranked = (m: Map<string, number>) =>
    [...m]
      .filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([text]) => text)

  const chosen: string[] = []
  const used = new Set<string>()
  for (const pair of ranked(pairs)) {
    if (chosen.length >= count) break
    const [a, b] = pair.split(" ")
    if (used.has(a ?? "") || used.has(b ?? "")) continue
    chosen.push(pair)
    used.add(a ?? "")
    used.add(b ?? "")
  }
  for (const word of ranked(singles)) {
    if (chosen.length >= count) break
    if (used.has(word)) continue
    chosen.push(word)
    used.add(word)
  }
  return chosen
}
