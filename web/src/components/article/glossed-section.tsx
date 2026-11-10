"use client"

import { ChevronRightIcon } from "lucide-react"
import type { ReactNode } from "react"

import type { Block, Section } from "@/lib/data"
import { typeset } from "@/lib/typeset"
import { cn } from "@/lib/utils"

import { foldsGroups, groupsOf, isCollapsedSection, segmentBlocks } from "./article-model"
import { BlockView, Blocks, tableLabels } from "./blocks"
import { GlossNotes } from "./gloss-notes"
import { AT, GRID } from "./grid"

/**
 * A band of the glossed grid with a rubric: the section's number and name hanging in the left margin
 * (≥ 1280 px; above the text, the number before the name, on narrower screens), the h2 of its
 * content. Its id is the URL's hash. The page's own bands (Key metrics moved up, Figures) have no
 * number: the record's sections are numbered from 1.
 */
export function SectionFrame({
  id,
  number,
  title,
  children,
  className,
}: {
  id: string
  number?: number
  title: string
  children: ReactNode
  className?: string
}) {
  const headingId = `${id}--title`
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      data-section=""
      className={cn(GRID, "mt-12 scroll-mt-2 gap-y-5 print:mt-8", className)}
    >
      <h2
        id={headingId}
        tabIndex={-1}
        data-section-heading=""
        className={cn(
          AT.rubric,
          "rounded-[2px] font-serif text-title font-semibold text-balance [font-variant-numeric:lining-nums] outline-none print:break-after-avoid",
          "xl:row-start-1 xl:pt-[0.1875rem] xl:text-right xl:text-note xl:text-rubric"
        )}
      >
        {number !== undefined ? (
          <>
            <span className="mr-1 text-rubric num xl:mr-0.5">{number}</span>{" "}
          </>
        ) : null}
        {typeset(title)}
      </h2>
      {children}
    </section>
  )
}

/**
 * A section of the article in the glossed grid: its text in the measure, the notes (quotes, sources)
 * in the margin beside the text they follow, wide tables across both. A section made only of quotes
 * ("In the paper's words") has them as its text; long detail (many sites) folds into
 * disclosures; "Sources and provenance" opens on request.
 */
export function GlossedSection({
  section,
  number,
  pdf,
  aside,
}: {
  section: Section
  number?: number
  pdf: string | null
  /** What the margin holds beside a section without notes (the facts that go on). */
  aside?: ReactNode
}) {
  const label = section.title
  return (
    <SectionFrame id={section.id} number={number} title={section.title}>
      <SectionBody section={section} pdf={pdf} label={label} aside={aside} />
    </SectionFrame>
  )
}

function SectionBody({
  section,
  pdf,
  label,
  aside,
}: {
  section: Section
  pdf: string | null
  label: string
  aside?: ReactNode
}) {
  const { blocks } = section
  if (isCollapsedSection(section)) {
    return (
      <div className={cn(AT.text, "xl:row-start-1")}>
        <Fold summary={foldSummary(blocks)}>
          <Blocks blocks={blocks} pdf={pdf} label={label} />
        </Fold>
      </div>
    )
  }
  if (blocks.length > 0 && blocks.every((b) => b.t === "quote" || b.t === "h3")) {
    return (
      <div className={cn(AT.text, "space-y-6 xl:row-start-1")}>
        {blocks.map((block, i) => (
          <BlockView key={i} block={block} pdf={pdf} notes="text" />
        ))}
      </div>
    )
  }
  if (foldsGroups(section)) {
    return (
      <div className={cn(AT.text, "xl:row-start-1")}>
        <ul className="border-t border-border">
          {groupsOf(blocks).map((group, i) => (
            <li key={i} className="border-b border-border">
              <Fold summary={typeset(group.heading ?? "")} item>
                <Blocks
                  blocks={group.blocks}
                  pdf={pdf}
                  label={group.heading ?? label}
                  className="pt-1 pb-5"
                />
              </Fold>
            </li>
          ))}
        </ul>
      </div>
    )
  }
  const labels = tableLabels(blocks, label)
  const labelOf = new Map<Block, string | undefined>(blocks.map((b, i) => [b, labels[i]]))
  // Fields hang their labels in the left margin (≥ 1280 px), where the rubric is: a section that
  // opens with fields starts a line below its rubric.
  const firstRow = blocks[0]?.t === "fields" ? "xl:row-start-2" : "xl:row-start-1"
  const segments = segmentBlocks(blocks)
  return (
    <>
      {firstRow === "xl:row-start-2" ? (
        // The rubric's own line: nothing else is placed beside it.
        <div
          aria-hidden="true"
          className="hidden xl:col-span-2 xl:col-start-2 xl:row-start-1 xl:block"
        />
      ) : null}
      {segments.map((segment, i) => {
        const first = i === 0 ? firstRow : ""
        if (segment.wide) {
          const block = segment.blocks[0]!
          return (
            <div key={i} className="contents">
              <div className={cn(AT.wide, first)}>
                <BlockView block={block} pdf={pdf} label={labelOf.get(block)} />
              </div>
              {segment.notes.length > 0 ? (
                <GlossNotes notes={segment.notes} pdf={pdf} className={AT.gloss} />
              ) : null}
            </div>
          )
        }
        return (
          <div key={i} className="contents">
            {segment.blocks.length > 0 ? (
              <div className={cn(AT.text, "space-y-5", first)}>
                {segment.blocks.map((block, j) => (
                  <BlockView key={j} block={block} pdf={pdf} label={labelOf.get(block)} />
                ))}
              </div>
            ) : null}
            {segment.notes.length > 0 ? (
              <GlossNotes
                notes={segment.notes}
                pdf={pdf}
                className={cn(AT.gloss, first, "lg:pt-1")}
              />
            ) : i === 0 && aside ? (
              // Narrow screens list every fact after the lede already.
              <div className={cn(AT.gloss, "max-lg:hidden lg:pt-1.5 print:block")}>{aside}</div>
            ) : null}
          </div>
        )
      })}
    </>
  )
}

/** What a folded section holds, as its summary: its field labels and sub-headings. */
function foldSummary(blocks: readonly Block[]): string {
  const names = blocks.flatMap((b) =>
    b.t === "fields" ? b.items.map((it) => it.label) : b.t === "h3" ? [b.text] : []
  )
  const unique = [...new Set(names)]
  const shown = unique.slice(0, 4).join(" · ")
  return typeset(unique.length > 4 ? `${shown} …` : shown)
}

/**
 * A disclosure: a summary line with a chevron; open, its content. `item` (a site, a device):
 * the summary in the serif's item style.
 */
function Fold({
  summary,
  item = false,
  children,
}: {
  summary: string
  item?: boolean
  children: ReactNode
}) {
  return (
    <details className="group/fold" data-fold="">
      <summary
        className={cn(
          "flex cursor-pointer list-none items-baseline gap-2 py-2 select-none [&::-webkit-details-marker]:hidden",
          item ? "item-title text-item" : "label"
        )}
      >
        <ChevronRightIcon
          aria-hidden="true"
          className="size-3.5 shrink-0 translate-y-0.5 self-start text-muted-foreground transition-transform duration-150 group-open/fold:rotate-90"
        />
        <span className="min-w-0">{summary}</span>
      </summary>
      {children}
    </details>
  )
}
