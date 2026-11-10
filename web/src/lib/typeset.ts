/**
 * The render-time typesetting pass (DESIGN 2.5): the data stays as written; what the page draws gets
 * real typography. Applied by the inline renderer to text, never to code, URLs, DOIs, keys or file
 * names (those are protected wherever they appear in a text, and link parts that are identifiers are
 * left alone by the renderer).
 *
 * Every language:
 *  1. `4x64`, `8 x 8` -> `4 × 64` (no-break spaces around ×); `4 plots x 64 sensors`, `−4.5 x RMS`
 *     too, the glue short there (a break allowed before × and before a unit word after it: a narrow
 *     cell never cuts a word); `0x1F`, `a 2x faster`, `the x axis` stay.
 *  2. `+/-` -> `±` (no-break spaces around it after a value); a hyphen before a figure after a space,
 *     a bracket or `=` -> the minus sign U+2212.
 *  3. Ranges of figures `4-10`, `13a-14b`, `1.5-2.0` -> en dash; ISO dates (`2023-08`, `2023-08-01`),
 *     chains (`978-3-16`) and identifiers (`S12-3`, `COVID-19`) stay. A range's dash holds to the
 *     figure after it (a word joiner, U+2060: `14–` never ends a line before `33%`), and so does a
 *     hyphen after a figure (`125,000-word`, `10-fold`: the serif has no non-breaking hyphen).
 *  4. A figure and its unit (`%`, `ms`, `Hz`, `mm`, `°C`, `trials`, `sensors`…) joined by a
 *     no-break space where a space was, and a hyphen after the unit held to its word (`1.5 mm-length`);
 *     a no-break space after `p.`, `pp.`, `§`, `Fig.`, `Table`, `Eq.` and the words that number
 *     (`Participant 1`, `plot 4`, `day 5`, `session 3`, `Figure 2`…), and around a comparison
 *     before a figure (`p < 0.05`, `r = 0.42`). Ranges with a prefix (`P1-P4` -> `P1–P4`) and of a
 *     figure's panels (`Fig. 2a-d` -> `2a–d`).
 *  5. `mm2`, `cm3` after a figure -> `mm²`, `cm³`; `1.2e-5`, and a power of ten written out
 *     (`1.69 × 10-09`, `3 x 10^-4`, `2×10^5`), -> `1.2 × 10` and a superscript (`\u22125`, leading zeros
 *     dropped).
 *  6. `...` -> `…`; an author list's `, … ,` -> ` … `; `(12 authors)` -> a muted `· 12 authors`.
 *  7. Apostrophes -> ’; straight quotes -> ‘ ’ “ ” by their side.
 *  8. In serif text (`acronyms: true`), runs of 2–6 capitals (`GPS`, `NDVI`, the plural `GPUs`,
 *     `RNN/CNN/LR` three times) -> an `<abbr class="ac">` of the capitals; mixed forms (`LiDAR`,
 *     `qPCR`, `S4ND`), names joined to a figure (`COVID-19`, `CIFAR-10`, `ISO-8601`), small Roman
 *     numerals (`II`, `XIV`) and texts all in capitals stay.
 * French (`lang: "fr"`):
 *  9. A narrow no-break space (U+202F) before `; : ! ? %` and the closing guillemet (U+00BB), after
 *     the opening one (U+00AB); not in `12:30`, `1:2`.
 * 10. U+202F between groups of thousands written with a space (`131 000`).
 * 11. Straight double quotes -> guillemets (U+00AB, U+00BB, U+202F inside); apostrophes -> ’.
 *
 * The pass is idempotent: typesetting typeset text changes nothing.
 */

/** A BCP 47 language code (`guessLang`); null or undefined for English. */
export type TypesetLang = string

export interface TypesetOptions {
  /** The text's language (from `guessLang`): "fr" adds the French rules; any other gets the common ones. */
  lang?: TypesetLang | null
  /** Mark acronyms as `<abbr class="ac">` (serif text only: the sans has no small caps). */
  acronyms?: boolean
}

/** A piece of typeset text: plain text, an acronym, a superscript, or a muted aside. */
export type TypesetPart =
  string | { t: "abbr"; text: string } | { t: "sup"; text: string } | { t: "muted"; text: string }

const NBSP = "\u00A0"
/** A word joiner: no line break on either side (invisible; copying drops it, `@/lib/clipboard`). */
const WJ = "\u2060"
const NNBSP = "\u202F"
const MINUS = "\u2212"

// Markers of the markup the pass produces (private-use characters; a text holding any is left as is).
const SUP_OPEN = "\uF8F0"
const SUP_CLOSE = "\uF8F1"
const MUTED_OPEN = "\uF8F2"
const MUTED_CLOSE = "\uF8F3"
const ABBR_OPEN = "\uF8F4"
const ABBR_CLOSE = "\uF8F5"
const PROTECTED_HEX = "\uF8F6" // the x of a hexadecimal number while dimensions are typeset
const PROTECT_BASE = 0xe000
const PRIVATE_USE = /[\uE000-\uF8FF]/u
const PROTECTED_TOKEN = /[\uE000-\uF7FF]/gu
const MARK = /\uF8F0([^\uF8F1]*)\uF8F1|\uF8F2([^\uF8F3]*)\uF8F3|\uF8F4([^\uF8F5]*)\uF8F5/gu

/** What is never typeset inside a text: addresses, identifiers, code, paths, file names. */
const PROTECTED = new RegExp(
  [
    // Code between backticks.
    "`[^`\\n]+`",
    // Web addresses.
    '\\b(?:https?|ftp):\\/\\/[^\\s<>"]+',
    '\\bwww\\.[^\\s<>"]+',
    // DOIs (doi:10.1038/…, 10.1038/…).
    '\\b(?:doi:\\s?)?10\\.\\d{4,9}\\/[^\\s<>"]+',
    // E-mail addresses.
    "[\\w.+-]+@[\\w-]+(?:\\.[\\w-]+)+",
    // Identifiers.
    "\\barXiv:\\s?[\\w.\\/-]+",
    "\\b(?:PMID|PMCID):?\\s?\\d+",
    "\\bPMC\\d+",
    // Paths: two slashes or more, or one and a file extension (not a list of acronyms: RNN/CNN/LR).
    "(?<![\\w.-])(?![A-Z]{2,6}(?:\\/[A-Z]{2,6})+\\b)(?:\\.{1,2}\\/|~\\/|\\/)?(?:[\\w.-]+\\/){2,}[\\w.-]*",
    "\\b[\\w.-]+\\/[\\w.-]+\\.[A-Za-z0-9]{1,5}\\b",
    // File names.
    "\\b[\\w.-]+\\.(?:pdf|json|csv|tsv|tex|bib|py|ipynb|md|txt|png|jpe?g|gif|svg|webp|html?|zip|gz|tar|mat|npy|npz|h5|xlsx?|docx?|pptx?|toml|ya?ml|sqlite|rdf|ris)\\b",
  ].join("|"),
  "giu"
)

const SUPERSCRIPT: Record<string, string> = {
  "0": "\u2070",
  "1": "\u00B9",
  "2": "²",
  "3": "³",
  "4": "\u2074",
  "5": "\u2075",
  "6": "\u2076",
  "7": "\u2077",
  "8": "\u2078",
  "9": "\u2079",
  [MINUS]: "\u207B",
  "-": "\u207B",
  "+": "\u207A",
}

const UNITS = [
  "%",
  "‰",
  "ms",
  "µs",
  "μs",
  "s",
  "min",
  "h",
  "Hz",
  "kHz",
  "MHz",
  "nm",
  "µm",
  "μm",
  "mm",
  "cm",
  "m",
  "km",
  "dB",
  "µV",
  "μV",
  "mV",
  "V",
  "°C",
  "days?",
  "trials?",
  "words?",
  "sentences?",
  "samples?",
  "sensors?",
  "arrays?",
  "channels?",
]

/** A figure, a space, a unit (squared or cubed), then not a letter or a figure. */
const NUMBER_UNIT = new RegExp(`(\\d)[ \\t](${UNITS.join("|")})([²³]?)(?![\\p{L}\\d])`, "gu")

/** A figure, its unit, a hyphen, a word: "1.5 mm-length" (the hyphen holds to its word). */
const UNIT_HYPHEN = new RegExp(`(\\d[ \\u00A0](?:${UNITS.join("|")})[²³]?)-(?=\\p{L})`, "gu")

/** The words that number what follows them ("Participant 1", "session 3"): a no-break space after. */
const NUMBERING =
  /(^|[^\p{L}])((?:[Pp]articipants?|[Pp]atients?|[Ss]ubjects?|[Ss]essions?|[Dd]ays?|[Ss]tages?|[Bb]locks?|[Aa]reas?|[Pp]lots?|[Ss]ites?|Figures?|Sections?|Videos?))[ \t](?=\d)/gu

/**
 * 2–6 capitals, a plural s outside; not when a figure is joined to them by a hyphen on either side
 * (`COVID-19`, `CIFAR-10`, `ISO-8601`, `S12-ABC`): those are names.
 */
const ACRONYM =
  /(?<!\d[\p{L}\p{N}]*[-\u2060]{1,2})\b([A-Z]{2,6})(?=s?\b)(?![-\u2060]{1,2}[\p{L}\p{N}]*\d)/gu

/** Small Roman numerals: not acronyms (Phase II, Table XIV). */
const ROMAN = /^(?:I{2,3}|IV|VI{0,3}|IX|XI{0,3}|XIV|XV|XVI{1,3}|XIX|XXI{0,3})$/

/** Typeset a text: plain text, acronyms, superscripts and muted asides, in order. */
export function typesetParts(text: string, options: TypesetOptions = {}): TypesetPart[] {
  if (!text) return []
  if (PRIVATE_USE.test(text)) return [text]
  const french = options.lang === "fr"

  // 0. Protect what is never typeset: each token becomes one private-use character.
  const tokens: string[] = []
  let s = text.replace(PROTECTED, (match) => {
    const token = trimToken(match)
    if (!token || tokens.length >= 0x1800) return match
    tokens.push(token)
    return String.fromCharCode(PROTECT_BASE + tokens.length - 1) + match.slice(token.length)
  })

  // 6. Ellipses, author lists, author counts.
  s = s.replace(/\.{3}/g, "…")
  s = s.replace(/\s*,\s*…\s*,\s*/g, " … ")
  s = s.replace(
    /\s*\((\d+)\s+authors\)/g,
    (_m, n: string) => ` ${MUTED_OPEN}· ${n}${NBSP}authors${MUTED_CLOSE}`
  )

  // 5b. Scientific notation (before ranges: "1e-5" is no range).
  s = s.replace(
    /(?<![\p{L}_\d.])(\d+(?:\.\d+)?)[eE][-\u2212](\d+)(?![\p{L}\d])/gu,
    (_m, mantissa: string, exp: string) =>
      `${mantissa}${NBSP}×${NBSP}10${SUP_OPEN}${MINUS}${exp}${SUP_CLOSE}`
  )

  // 5c. A power of ten written out ("× 10-09", "x 10^-4", "×10^5"): before the dimensions and the
  // ranges would read "× 10" and "10–09".
  s = s.replace(
    /(\d)[ \t\u00A0]?[x×][ \t\u00A0]?10(?:\^([-\u2212\u2013]?)|([-\u2212\u2013]))(\d+)(?![\p{L}\d.,])/gu,
    (_m, digit: string, caretSign: string | undefined, sign: string | undefined, exp: string) =>
      `${digit}${NBSP}×${NBSP}10${SUP_OPEN}${caretSign || sign ? MINUS : ""}${exp.replace(/^0+(?=\d)/, "")}${SUP_CLOSE}`
  )

  // 2. Plus or minus.
  s = s.replace(/([\d%)\]])[ \t\u00A0]*(?:\+\/-|±)[ \t\u00A0]*(?=[\d.(])/gu, `$1${NBSP}±${NBSP}`)
  s = s.replace(/\+\/-/g, "±")

  // 1. Dimensions ("0x1F" is hexadecimal, not "0 by 1F").
  s = s.replace(/(?<![\w.])0x(?=[\dA-Fa-f])/g, `0${PROTECTED_HEX}`)
  s = s.replace(/(\d)( ?)[x×]( ?)(?=\d)/g, `$1${NBSP}×${NBSP}`)
  // "4 arrays x 64 channels" (a count of things times a count), "−4.5 x RMS" (a figure times a unit).
  // The sign holds to the figure after it; a line may break before it ("4 arrays / × 64").
  s = s.replace(/(\d(?:[ \u00A0][\p{L}-]{1,20}){1,2})[ \u00A0]x[ \u00A0](?=\d)/gu, `$1 ×${NBSP}`)
  s = s.replace(/(\d)[ \u00A0]x[ \u00A0](?=\p{Lu}{2,}\b)/gu, `$1${NBSP}×${NBSP}`)
  s = s.replaceAll(PROTECTED_HEX, "x")

  // 2b. A minus before a figure.
  s = s.replace(/(^|[\s(=≈~[<>≤≥])-(?=\d)/gu, `$1${MINUS}`)

  // 3a. Ranges with a prefix ("P1-P4", "C4-C5") and of a figure's panels ("Fig. 2a-d").
  s = s.replace(/\b([A-Z]{1,3})(\d+)-\1(\d+)\b/g, `$1$2–${WJ}$1$3`)
  s = s.replace(/(\b(?:Figs?\.|Figures?)[ \t\u00A0]?\d+)([a-z])-([a-z])\b/gu, "$1$2–$3")

  // 3. Ranges of figures.
  s = s.replace(
    /(?<![\p{L}\d.,:\-/_\u2212])(\d+(?:[.,]\d+)?[a-z]?)-(\d+(?:[.,]\d+)?[a-z]?)(?![\d\-/]|[.,]\d)/gu,
    (m, a: string, b: string) => (isYearMonth(a, b) ? m : `${a}–${WJ}${b}`)
  )
  // 3b. A range written with its dash holds to the figure after it; so does a hyphen after a figure
  // before a word ("125,000-word", "10-fold").
  s = s.replace(/(\d)–(?=[\d\u2212])/gu, `$1–${WJ}`)
  s = s.replace(/(\d)-(?=\p{L})/gu, `$1-${WJ}`)

  // 5. Square and cubic units after a figure.
  s = s.replace(
    /((?:\d[ \t\u00A0]?)|\/|\bper )(mm|cm|km|µm|μm|m)([23])(?![\p{L}\d])/gu,
    (_m, before: string, unit: string, power: string) =>
      `${before}${unit}${power === "2" ? "²" : "³"}`
  )

  // 4b. A comparison before a figure stays on its line ("p < 0.05", "r = 0.42").
  s = s.replace(/[ \t]([<>≤≥=≈~])[ \t](?=[-\u2212]?\.?\d)/gu, `${NBSP}$1${NBSP}`)

  // 4. Figures and their units; page, section, figure and table numbers.
  s = s.replace(NUMBER_UNIT, `$1${NBSP}$2$3`)
  s = s.replace(UNIT_HYPHEN, `$1-${WJ}`)
  // Words that number what follows: "Participant 1", "day 5", "session 3", "Figure 2".
  s = s.replace(NUMBERING, `$1$2${NBSP}`)
  // Short glue: a figure after × holds to the sign, not to a unit word too ("× 64 sensors" may
  // break before "sensors": a narrow table cell never cuts inside a word).
  s = s.replace(/(×\u00A0[\d.,]+)\u00A0(?=\p{L}{4,})/gu, "$1 ")
  s = s.replace(/(^|[^\p{L}])(pp?\.|§§?|Figs?\.|Tables?|Eqs?\.)[ \t](?=[\dA-Z])/gu, `$1$2${NBSP}`)

  // 7 and 11. Apostrophes and quotes.
  s = s.replace(/(^|[\s(])'(?=\d{2}s?\b)/g, "$1’")
  s = s.replace(/(\d)'(\d+)"/g, "$1′$2″")
  const singles = s
  s = s.replace(/'/g, (_m, offset: number) => (opens(singles, offset) ? "‘" : "’"))
  const doubles = s
  s = s.replace(/"/g, (_m, offset: number) => {
    const open = opens(doubles, offset)
    if (french) return open ? `\u00AB${NNBSP}` : `${NNBSP}\u00BB`
    return open ? "“" : "”"
  })

  if (french) {
    // 9. Narrow no-break spaces before high punctuation and inside guillemets.
    s = s.replace(/\u00AB[ \u00A0\u202F]*/gu, `\u00AB${NNBSP}`)
    s = s.replace(/(?<=[^\s;:!?\u00AB(\[])[ \u00A0\u202F]*([;!?\u00BB])/gu, `${NNBSP}$1`)
    s = s.replace(/(?<=[^\s;:!?\u00AB(\[])[ \u00A0\u202F]*:(?!\d)/gu, `${NNBSP}:`)
    s = s.replace(/(\d)[ \u00A0\u202F]*%/gu, `$1${NNBSP}%`)
    // 10. Groups of thousands written with a space.
    s = s.replace(/(?<![\d.,])\d{1,3}(?:[ \u00A0]\d{3})+(?!\d)/gu, (m) =>
      m.replace(/[ \u00A0]/gu, NNBSP)
    )
  }

  // 8. Acronyms, in the text's own words (protected tokens are single characters here), unless the
  // whole text is in capitals.
  if (options.acronyms && /\p{Ll}/u.test(text)) {
    s = s.replace(ACRONYM, (m, caps: string) =>
      ROMAN.test(caps) ? m : `${ABBR_OPEN}${caps}${ABBR_CLOSE}`
    )
  }

  // Restore the protected tokens, then cut the markup out.
  s = s.replace(PROTECTED_TOKEN, (c) => tokens[c.charCodeAt(0) - PROTECT_BASE] ?? c)
  return markup(s)
}

/** Typeset a text into a plain string (superscripts as Unicode, asides and acronyms as text). */
export function typeset(text: string, lang?: TypesetLang | null): string {
  return typesetParts(text, { lang })
    .map((part) =>
      typeof part === "string"
        ? part
        : part.t === "sup"
          ? [...part.text].map((c) => SUPERSCRIPT[c] ?? c).join("")
          : part.text
    )
    .join("")
}

/** Trailing punctuation a protected token does not own ("see https://x.org." -> the dot is text). */
function trimToken(token: string): string {
  let t = token.replace(/[.,;:!?]+$/u, "")
  // An unbalanced closing bracket belongs to the sentence ("(doi:10.1/x)").
  for (const [open, close] of [
    ["(", ")"],
    ["[", "]"],
  ] as const) {
    while (t.endsWith(close) && count(t, close) > count(t, open)) t = t.slice(0, -1)
  }
  return t
}

function count(s: string, ch: string): number {
  return s.split(ch).length - 1
}

/** "2023-08": a year and a month, not a range. */
function isYearMonth(a: string, b: string): boolean {
  if (!/^\d{4}$/.test(a) || !/^\d{2}$/.test(b)) return false
  const year = Number(a)
  const month = Number(b)
  return year >= 1000 && year <= 2999 && month >= 1 && month <= 12
}

/** Does the quote at `offset` open (after a space, a bracket, a dash or the start)? */
function opens(s: string, offset: number): boolean {
  const before = s[offset - 1]
  return before === undefined || /[\s([{“‘\u00AB—–\-/\u00A0\u202F]/u.test(before)
}

/** Cut the marked text into parts. */
function markup(s: string): TypesetPart[] {
  const parts: TypesetPart[] = []
  let last = 0
  MARK.lastIndex = 0
  for (let m = MARK.exec(s); m !== null; m = MARK.exec(s)) {
    push(parts, s.slice(last, m.index))
    if (m[1] !== undefined) parts.push({ t: "sup", text: m[1] })
    else if (m[2] !== undefined) parts.push({ t: "muted", text: m[2] })
    else parts.push({ t: "abbr", text: m[3] ?? "" })
    last = m.index + m[0].length
  }
  push(parts, s.slice(last))
  return parts
}

function push(parts: TypesetPart[], text: string): void {
  if (!text) return
  const prev = parts[parts.length - 1]
  if (typeof prev === "string") parts[parts.length - 1] = prev + text
  else parts.push(text)
}
