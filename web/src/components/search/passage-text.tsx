import { Fragment, type ReactNode } from "react"

import { PageMark, pageRefOf } from "@/components/content/page-mark"
import type { SearchHit } from "@/lib/api"
import { pdfPageHref, recordField } from "@/lib/data"
import { guessLang } from "@/lib/lang"
import { cn } from "@/lib/utils"

import { MarkedText } from "./highlight"
import type { HitPlace, MetricRow } from "./hits"
import { fieldName, parseRecordSnippet, tidySnippet } from "./snippet"

/** An ellipsis where the passage was cut: muted, so the words lead. */
export function Cut() {
  return <span className="text-muted-foreground">…</span>
}

/** A label inside running serif text: small caps, muted, a little air. */
export function InlineLabel({ children }: { children: ReactNode }) {
  return (
    <span className="font-semibold tracking-[0.05em] text-muted-foreground [font-variant-caps:all-small-caps]">
      {children}
    </span>
  )
}

/** "9.1% (95% CI 7.2, 11.2)" → the figure ("9.1%") and the rest: only the figure is bold. */
export function splitValue(value: string): [string, string] {
  const m = /^((?:[≈~<>≤≥]\s?)?[−-]?\d[\d.,]*(?:\s?(?:%|‰|×))?)(.*)$/su.exec(value.trim())
  return m ? [m[1] ?? "", m[2] ?? ""] : ["", value.trim()]
}

/** A record's word for "nothing here": drawn muted. */
const SENTINEL = /^(?:not reported|not applicable|none|—|-)\.?$/i

/** A metric's name as the start of a line: "accuracy and…" → "Accuracy and…" (never "dB", "r"). */
export function sentenceCase(text: string): string {
  return /^\p{Ll}{2,}/u.test(text) ? text.charAt(0).toUpperCase() + text.slice(1) : text
}

/** A metric of a summary in one line: its name, the value (the figure bold), the condition muted. */
export function MetricLine({ metric, terms }: { metric: MetricRow; terms: readonly string[] }) {
  const [figure, rest] = splitValue(metric.value)
  const condition = metric.condition && !SENTINEL.test(metric.condition) ? metric.condition : ""
  return (
    <>
      {metric.name ? (
        <>
          <MarkedText text={sentenceCase(metric.name)} terms={terms} grade acronyms />{" "}
        </>
      ) : null}
      {figure ? (
        <b className="font-semibold [font-variant-numeric:lining-nums_proportional-nums]">
          <MarkedText text={figure} terms={terms} grade />
        </b>
      ) : null}
      {rest ? <MarkedText text={rest} terms={terms} grade acronyms /> : null}
      {condition ? (
        <span className="text-muted-foreground">
          {" · "}
          <MarkedText text={condition} terms={terms} grade acronyms />
        </span>
      ) : null}
    </>
  )
}

/** A summary's flattened passage as labelled parts (never a raw field name). */
function RecordLine({ hit, terms }: { hit: SearchHit; terms: readonly string[] }) {
  const { parts, cutStart, cutEnd } = parseRecordSnippet(hit.snippet, recordField(hit.source))
  return (
    <>
      {parts.map((part, i) => {
        const name = part.field ? fieldName(part.field) : null
        const quote = name === "text" || name === "quote"
        const lead = i === 0 && cutStart
        const tail = i === parts.length - 1 && cutEnd
        return (
          <Fragment key={i}>
            {i > 0 ? <span className="text-muted-foreground"> · </span> : null}
            {part.label && !quote && !lead ? (
              <>
                <InlineLabel>{part.label}</InlineLabel>{" "}
              </>
            ) : null}
            {quote ? "“" : null}
            {lead ? <Cut /> : null}
            <span className={cn(SENTINEL.test(part.text) && "text-muted-foreground")}>
              <MarkedText
                text={part.text}
                terms={terms}
                grade
                acronyms
                lang={guessLang(part.text)}
              />
            </span>
            {tail ? <Cut /> : null}
            {quote ? "”" : null}
          </Fragment>
        )
      })}
    </>
  )
}

/**
 * The words of a hit as the results show them: a passage of a paper or a file (its cut set as "…",
 * starting where a sentence starts when it can), a metric of the summary (the figure bold), or
 * another part of the summary with its labels.
 */
export function PassageWords({
  hit,
  place,
  terms,
}: {
  hit: SearchHit
  place: HitPlace
  terms: readonly string[]
}) {
  if (place.kind === "record") {
    return place.metric ? (
      <MetricLine metric={place.metric} terms={terms} />
    ) : (
      <RecordLine hit={hit} terms={terms} />
    )
  }
  const { text, cutStart, cutEnd } = tidySnippet(hit.snippet, terms)
  return (
    <>
      {cutStart ? <Cut /> : null}
      <MarkedText text={text} terms={terms} grade acronyms lang={guessLang(text)} />
      {cutEnd ? <Cut /> : null}
    </>
  )
}

/**
 * A text with its first page reference ("p. 2, Methods") drawn as a page mark, linked to the paper
 * at that page when `paperHref` is given.
 */
export function PagedText({
  text,
  terms,
  paperHref,
  className,
}: {
  text: string
  terms: readonly string[]
  paperHref: string | null
  className?: string
}) {
  const ref = pageRefOf(text)
  if (!ref) {
    return (
      <span className={className}>
        <MarkedText text={text} terms={terms} grade acronyms lang={guessLang(text)} />
      </span>
    )
  }
  return (
    <span className={cn(className)}>
      {ref.before ? <MarkedText text={ref.before} terms={terms} grade acronyms /> : null}
      <PageMark
        page={ref.page}
        doc={ref.doc}
        href={!ref.doc && paperHref ? pdfPageHref(paperHref, ref.page) : null}
      >
        {ref.text}
      </PageMark>
      {ref.after ? <MarkedText text={ref.after} terms={terms} grade acronyms /> : null}
    </span>
  )
}
