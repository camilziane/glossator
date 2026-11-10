/**
 * The language of a piece of the data, when it is not the page's English: titles come in any
 * language, and the inbox's triage summaries are written in the library's language (`language` in
 * library.toml). Screen readers read a text with the wrong voice unless its element says `lang`,
 * and the typesetting pass has rules of its own for some languages. The data does not say which
 * language a text is in, so a small guess from the short words every sentence uses stands in for it.
 */

/** The languages the guess tells apart from English. */
export type Lang = "de" | "es" | "fr" | "it" | "pt"

const words = (list: string): ReadonlySet<string> => new Set(list.split(" "))

const STOP_WORDS: Record<Lang | "en", ReadonlySet<string>> = {
  en: words(
    "the a an of and is are in for by on with without to at this that these which who what not more but or it its they we be been between very also as from than into study paper"
  ),
  de: words(
    "der die das den dem des ein eine einer eines und ist sind im in für mit ohne auf aus bei von zu zum zur nicht auch wie über wir sie es oder aber nach durch wird werden"
  ),
  es: words(
    "el la los las un una unos unas del de y es son en por para con sin sobre que se su sus no más pero o como entre muy también al lo"
  ),
  fr: words(
    "le la les un une des du de et est sont en pour par sur sans aux au ce ces qui que dont où pas plus mais ou il ils elle elles leur leurs son sa ses se été entre aussi comme selon chez"
  ),
  it: words(
    "il lo la gli le un una dei degli delle di e è sono per con senza su che non più ma o come tra anche nel nella del della"
  ),
  pt: words(
    "o a os as um uma dos das do da de e é são em por para com sem sobre que não mais mas ou como entre também no na ao"
  ),
}

/** Letters that tip a short text towards one language. */
const LETTERS: Partial<Record<Lang, RegExp>> = {
  de: /[äöüß]/i,
  es: /[ñ¿¡]/i,
  pt: /[ãõ]/i,
}

const cache = new Map<string, Lang | undefined>()

/**
 * The language of a text when it reads as German, Spanish, French, Italian or Portuguese, else
 * undefined (English, a mix, or too short to tell).
 */
export function guessLang(text: string | null | undefined): Lang | undefined {
  if (!text) return undefined
  const known = cache.get(text)
  if (known !== undefined || cache.has(text)) return known
  const found = text.toLowerCase().match(/\p{L}+/gu) ?? []
  const score = { en: 0, de: 0, es: 0, fr: 0, it: 0, pt: 0 }
  for (const w of found) {
    for (const lang of Object.keys(score) as (Lang | "en")[]) {
      if (STOP_WORDS[lang].has(w)) score[lang] += 1
    }
  }
  for (const [lang, letters] of Object.entries(LETTERS) as [Lang, RegExp][]) {
    if (letters.test(text)) score[lang] += 1
  }
  const ranked = (Object.keys(score) as (Lang | "en")[])
    .filter((lang): lang is Lang => lang !== "en")
    .sort((a, b) => score[b] - score[a])
  const [best, second] = ranked
  const lang =
    best && score[best] >= 2 && score[best] > score.en && score[best] > (second ? score[second] : 0)
      ? best
      : undefined
  cache.set(text, lang)
  return lang
}
