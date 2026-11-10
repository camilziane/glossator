/**
 * A key metric's value as the table draws it: the confidence interval written at its end split into
 * a column of its own ("9.1% (95% CI 7.2, 11.2)" → "9.1%" and 7.2–11.2), and the figure the reader
 * scans for (the first number, with its % or ‰) set apart from the words around it, so only it is
 * bold. The data stays as written: these only cut it.
 */

export interface Confidence {
  /** The interval's level, as written: "95". */
  level: string
  low: string
  high: string
}

export interface MetricValue {
  /** The value without its interval ("9.1%", "10.5% (median)"). */
  value: string
  /** The interval written at the end of the value, or null. */
  ci: Confidence | null
}

/** A number of an interval: "7.2", "−0.4", "3.1%". */
const BOUND = String.raw`[−-]?\d+(?:\.\d+)?(?:\s?%)?`
/** Between the bounds: ", ", " to ", "–", a space alone ("[20.0 34.7]"). */
const BETWEEN = String.raw`(?:\s*(?:,|;|\bto\b|[–—-])\s*|\s+)`

/**
 * An interval closing the value: "(95% CI 7.2, 11.2)", "[95% CI 88.4, 94.6]", "(99% CI: [5.76,
 * 24.8])", "(median; 99% CI [14.1, 28.5])" (the qualifier stays with the value).
 */
const CI_AT_END = new RegExp(
  String.raw`\s*[(\[]\s*(?:([\p{L}][\p{L} ]*?)\s*[;,]\s*)?(\d{2}(?:\.\d+)?)\s?%\s*(?:CI|confidence interval)\s*:?\s*\[?\s*(${BOUND})${BETWEEN}(${BOUND})\s*\]?\s*[)\]]\s*$`,
  "iu"
)

/** The value and the confidence interval written at its end, if any. */
export function splitConfidence(text: string): MetricValue {
  const m = CI_AT_END.exec(text)
  if (!m) return { value: text, ci: null }
  const before = text.slice(0, m.index).trim()
  // Nothing left but the interval, or a value of several parts ("P1 0.4 (…); P2 2.0 (…)"): the
  // interval is one part's, not the value's. Keep the text whole.
  if (!before || !/\d/.test(before) || /[;]|\b(?:CI)\b/iu.test(before))
    return { value: text, ci: null }
  const qualifier = m[1]?.trim()
  return {
    value: qualifier ? `${before} (${qualifier})` : before,
    ci: { level: m[2] ?? "", low: (m[3] ?? "").trim(), high: (m[4] ?? "").trim() },
  }
}

/** The interval as the column shows it: "7.2–11.2" (an en dash, no spaces). */
export function formatConfidence(ci: Confidence): string {
  return `${ci.low}–${ci.high}`
}

/** Whether `at` is inside a bracket that holds a confidence interval ("(95% CI 1.0 to 2.0)"). */
function insideInterval(value: string, at: number): boolean {
  let depth = 0
  for (let i = at - 1; i >= 0; i--) {
    const c = value[i]
    if (c === ")" || c === "]") depth++
    else if (c === "(" || c === "[") {
      if (depth > 0) depth--
      else if (/\b(?:CI)\b|confidence/iu.test(value.slice(i, at))) return true
    }
  }
  return false
}

/** A piece of a value: words, or a figure set in bold. */
export type ValuePiece = string | { number: string }

/**
 * A number: "9.1%", "0.73", "−30", "2,140", a range "40–50%", a mean and its spread "88.5 ± 0.4%";
 * not a figure inside a word ("S15", "S4ND").
 */
const NUMBER =
  /(^|[\s(\[≈~<>≤≥=±/])([−-]?\d+(?:,\d{3})*(?:\.\d+)?(?:[–-]\d+(?:\.\d+)?)?(?:[\s\u00A0]?±[\s\u00A0]?\d+(?:\.\d+)?)?(?:\s?[%‰])?)(?![\p{L}\d]|[.,]\d)/gu

/**
 * A value cut so that only its figures are bold: every percentage ("**24%** (P1), **14%** (P2)"),
 * or, when it has none, its first number ("**0.73** events per 100 000"). Joined back, the pieces
 * give the value.
 */
export function boldFigures(value: string): ValuePiece[] {
  const found = [...value.matchAll(NUMBER)]
    .map((m) => ({ start: (m.index ?? 0) + (m[1]?.length ?? 0), number: m[2] ?? "" }))
    // An interval's level ("95% CI") and its bounds are no figures of the value.
    .filter(
      (f) =>
        !/^\s*(?:CI|confidence)\b/iu.test(value.slice(f.start + f.number.length)) &&
        !insideInterval(value, f.start)
    )
  const percents = found.filter((f) => /[%‰]$/u.test(f.number))
  const bold = percents.length > 0 ? percents : found.slice(0, 1)
  const out: ValuePiece[] = []
  let at = 0
  for (const f of bold) {
    if (f.start > at) out.push(value.slice(at, f.start))
    out.push({ number: f.number })
    at = f.start + f.number.length
  }
  if (at < value.length) out.push(value.slice(at))
  return out
}
