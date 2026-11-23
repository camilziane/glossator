"use client"

import { ChevronRightIcon } from "lucide-react"
import type { ReactNode } from "react"

import { IdentityIcon } from "@/components/content/identity"
import type { Block, Section } from "@/lib/data"
import { sectionIdentity, type Identity } from "@/lib/identity"
import { typeset } from "@/lib/typeset"
import { cn } from "@/lib/utils"

import { useArticleContext } from "./article-context"
import { foldsGroups, groupsOf, isCollapsedSection } from "./article-model"
import { BlockView, Blocks, tableLabels } from "./blocks"
import { AT, GRID } from "./grid"

/**
 * A band of the article: its heading (the section's icon in its family's ink, then its name), the
 * h2 of its content. Its id is the URL's hash. The section's identity is its profile's mark for its
 * id; the page's own bands (the figures) pass theirs.
 */
export function SectionFrame({
  id,
  title,
  identity,
  children,
  className,
}: {
  id: string
  title: string
  /** The page's own band's identity (else the profile's mark for `id`). */
  identity?: Identity | null
  children: ReactNode
  className?: string
}) {
  const { identities } = useArticleContext()
  const headingId = `${id}--title`
  const mark = identity === undefined ? sectionIdentity(identities, id) : identity
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      data-section=""
      className={cn(GRID, "mt-14 scroll-mt-2 gap-y-5 print:mt-8", className)}
    >
      <h2
        id={headingId}
        tabIndex={-1}
        data-section-heading=""
        className="flex items-center gap-2.5 rounded-[2px] title text-foreground outline-none print:break-after-avoid"
      >
        <IdentityIcon identity={mark} className="size-5" />
        <span className="min-w-0">{typeset(title)}</span>
      </h2>
      {children}
    </section>
  )
}

/**
 * A section of the article, in one column: its text in the measure, each label over its value, the
 * notes (quotes, sources) after the text they gloss, wide tables at the column's width. A section
 * made only of quotes ("In the paper's words") has them as its text; long detail (many sites)
 * folds into disclosures; "Sources and provenance" opens on request.
 */
export function GlossedSection({ section, pdf }: { section: Section; pdf: string | null }) {
  return (
    <SectionFrame id={section.id} title={section.title}>
      <SectionBody section={section} pdf={pdf} />
    </SectionFrame>
  )
}

function SectionBody({ section, pdf }: { section: Section; pdf: string | null }) {
  const { blocks } = section
  const label = section.title
  if (isCollapsedSection(section)) {
    return (
      <div className={AT.text}>
        <Fold summary={foldSummary(blocks)}>
          <Blocks blocks={blocks} pdf={pdf} label={label} section={section.id} />
        </Fold>
      </div>
    )
  }
  if (blocks.length > 0 && blocks.every((b) => b.t === "quote" || b.t === "h3")) {
    return (
      <div className={cn(AT.text, "space-y-6")}>
        {blocks.map((block, i) => (
          <BlockView key={i} block={block} pdf={pdf} notes="text" section={section.id} />
        ))}
      </div>
    )
  }
  if (foldsGroups(section)) {
    return (
      <div className={AT.text}>
        <ul className="border-t border-border">
          {groupsOf(blocks).map((group, i) => (
            <li key={i} className="border-b border-border">
              <Fold summary={typeset(group.heading ?? "")} item>
                <Blocks
                  blocks={group.blocks}
                  pdf={pdf}
                  label={group.heading ?? label}
                  section={section.id}
                  className="pt-1 pb-5"
                />
              </Fold>
            </li>
          ))}
        </ul>
      </div>
    )
  }
  // In their order: a note (a quote, a source) follows the text it glosses, a wide table takes the
  // column's width.
  const labels = tableLabels(blocks, label)
  return (
    <div className={cn(AT.text, "space-y-5")}>
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} pdf={pdf} label={labels[i]} section={section.id} />
      ))}
    </div>
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
