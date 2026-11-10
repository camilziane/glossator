"use client"

import type { ReactNode } from "react"

import type { Section } from "@/lib/data"
import { formatNumber } from "@/lib/format"
import { typeset } from "@/lib/typeset"
import { cn } from "@/lib/utils"

import { clauseOf, FACT_LINE_CHARS, isFactList, sectionForLabel, type Fact } from "./article-model"
import { InlineWithPages } from "./inline-pages"
import { goToSection } from "./use-scroll-spy"

/** Lines of a fact of several lines (the plots of a study) before "… n more". */
const FACT_LINES = 3

/** A link to a section that goes there the page's way (smooth or instant, the heading focused). */
function SectionLink({
  section,
  className,
  children,
}: {
  section: Section
  className?: string
  children: ReactNode
}) {
  return (
    <a
      href={`#${encodeURIComponent(section.id)}`}
      onClick={(e) => {
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
        e.preventDefault()
        goToSection(section.id)
      }}
      className={className}
    >
      {children}
    </a>
  )
}

/** "… more": what the margin left out is in the section (a plain "…" when no section says it). */
function More({ section, label }: { section: Section | undefined; label: string }) {
  if (!section) return <span aria-hidden="true">…</span>
  return (
    <>
      {" … "}
      <SectionLink section={section} className="font-sans text-small link text-muted-foreground">
        more<span className="sr-only"> about {label.toLowerCase()}</span>
      </SectionLink>
    </>
  )
}

/**
 * Facts in the margin (from the glance tiles): a label in small caps over a serif value at the
 * gloss's size. No fades: a value is its first clause (at most about three lines), a list its first
 * three lines (each its first clause), then "… more", which leads to the section that tells it all.
 * Beside the title, and on narrow screens a compact list after the lede; the facts that do not fit
 * beside the title go on beside the first section without notes (`continued`).
 */
export function ArticleFacts({
  facts,
  sections,
  pdf,
  continued = false,
  hiddenFrom,
  className,
}: {
  facts: readonly Fact[]
  sections: readonly Section[]
  pdf: string | null
  /** The facts that go on beside a section (no heading of their own: the first part has it). */
  continued?: boolean
  /** From this fact on, only narrow screens show them here (the others go on beside a section). */
  hiddenFrom?: number
  className?: string
}) {
  if (facts.length === 0) return null
  const list = (
    <dl
      className={cn(
        "grid grid-cols-[minmax(0,1fr)] gap-x-5 gap-y-3.5 max-lg:grid-cols-[minmax(7rem,auto)_minmax(0,1fr)] max-lg:gap-y-2.5 print:grid-cols-[minmax(0,1fr)] print:gap-y-2",
        !continued && "border-t border-border pt-3"
      )}
    >
      {facts.map((fact, i) => {
        const section = sectionForLabel(fact.label, sections)
        const many = isFactList(fact)
        // A list's first lines ("… 1 more" says less than the line: all of them then); a value's
        // first line (the others, tags and detail, are the section's).
        const lines = many
          ? fact.lines.length > FACT_LINES + 1
            ? fact.lines.slice(0, FACT_LINES)
            : fact.lines
          : fact.lines.slice(0, 1)
        const left = many ? fact.lines.length - lines.length : 0
        const more = !many && fact.lines.length > 1
        return (
          <div
            key={i}
            className={cn(
              "contents lg:block print:block",
              hiddenFrom !== undefined && i >= hiddenFrom && "lg:hidden print:hidden"
            )}
          >
            <dt className="label max-lg:pt-[0.125rem] print:pt-0">
              {section ? (
                <SectionLink
                  section={section}
                  className="decoration-[color-mix(in_oklab,var(--rubric)_55%,transparent)] underline-offset-[0.18em] hover:text-foreground hover:underline"
                >
                  {typeset(fact.label)}
                </SectionLink>
              ) : (
                typeset(fact.label)
              )}
            </dt>
            <dd className="min-w-0 gloss text-pretty hyphens-none text-foreground lg:mt-0.5">
              {lines.map((line, j) => {
                const { parts, cut } = clauseOf(
                  line,
                  many ? { max: FACT_LINE_CHARS, paren: true } : {}
                )
                return (
                  <span key={j} className="block">
                    <InlineWithPages parts={parts} pdf={pdf} />
                    {(cut || more) && !many ? <More section={section} label={fact.label} /> : null}
                    {cut && many ? <span aria-hidden="true">…</span> : null}
                  </span>
                )
              })}
              {left > 0 ? (
                <span className="block font-sans text-small text-muted-foreground">
                  {section ? (
                    <SectionLink section={section} className="link">
                      … {formatNumber(left)} more
                    </SectionLink>
                  ) : (
                    `… ${formatNumber(left)} more`
                  )}
                </span>
              ) : null}
            </dd>
          </div>
        )
      })}
    </dl>
  )
  if (continued) {
    return (
      <div className={className}>
        <h3 className="sr-only">More facts</h3>
        {list}
      </div>
    )
  }
  return (
    <section aria-labelledby="article-facts" className={className}>
      <h2 id="article-facts" className="sr-only">
        Facts
      </h2>
      {list}
    </section>
  )
}
