"use client"

import type { ReactNode } from "react"

import type { Block, BulletsBlock, FieldsBlock, ParagraphBlock } from "@/lib/data"
import { typeset } from "@/lib/typeset"
import { cn } from "@/lib/utils"

import { isMetricsTable } from "./article-model"
import { FigureBlockView } from "./figure-block"
import { QuoteNote, SourceNote, type NoteLayout } from "./gloss-notes"
import { InlineWithPages } from "./inline-pages"
import { KeyMetricsTable } from "./key-metrics"
import { TableBlockView } from "./table-block"

export interface BlocksProps {
  blocks: readonly Block[]
  /** The article's PDF: cited pages open it at that page. */
  pdf?: string | null
  /** The section's title, naming its tables for assistive technologies. */
  label?: string
  /** How quotes and sources are drawn among the blocks: as notes after their text (the default). */
  notes?: NoteLayout
  className?: string
}

/**
 * Blocks in their order (sitedata.blocks): paragraphs, sub-headings, fields, bullets, tables, figures,
 * and quotes and sources as notes after the text they gloss. The glossed section puts the notes in the
 * margin instead (`GlossedSection`); this flow is for folded detail and for narrow places.
 */
export function Blocks({ blocks, pdf = null, label, notes = "inline", className }: BlocksProps) {
  const tableLabel = tableLabels(blocks, label)
  return (
    <div className={cn("flow-root space-y-5", className)}>
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} pdf={pdf} label={tableLabel[i]} notes={notes} />
      ))}
    </div>
  )
}

/** The names of a section's tables: its title, numbered when there are several. */
export function tableLabels(blocks: readonly Block[], label?: string): (string | undefined)[] {
  const tables = blocks.filter((b) => b.t === "table").length
  let n = 0
  return blocks.map((b) => {
    if (b.t !== "table" || !label) return undefined
    n += 1
    return tables > 1 ? `${label}, table ${n}` : `${label}, table`
  })
}

/** One block. Quotes and sources as notes (`notes`): inline after their text, or as the text. */
export function BlockView({
  block,
  pdf,
  label,
  notes = "inline",
}: {
  block: Block
  pdf: string | null
  label?: string
  notes?: NoteLayout
}): ReactNode {
  switch (block.t) {
    case "p":
      return <Paragraph block={block} pdf={pdf} />
    case "h3":
      return (
        <h3 className="pt-2 font-serif text-read font-semibold text-balance [font-variant-numeric:lining-nums]">
          {typeset(block.text)}
        </h3>
      )
    case "fields":
      return <Fields block={block} pdf={pdf} />
    case "bullets":
      return <Bullets block={block} pdf={pdf} />
    case "table":
      return isMetricsTable(block) ? (
        <KeyMetricsTable block={block} pdf={pdf} label={label} />
      ) : (
        <TableBlockView block={block} pdf={pdf} label={label} />
      )
    case "quote":
      return <QuoteNote block={block} pdf={pdf} layout={notes} />
    case "figure":
      return <FigureBlockView block={block} pdf={pdf} />
    case "source":
      return <SourceNote block={block} pdf={pdf} layout={notes} />
    default:
      return null
  }
}

function Paragraph({ block, pdf }: { block: ParagraphBlock; pdf: string | null }) {
  return (
    <p className="max-w-measure reading">
      <InlineWithPages parts={block.c} pdf={pdf} />
    </p>
  )
}

/**
 * Label and value pairs: from 1280 px the labels are side-heads in the left margin (small caps,
 * right-aligned, muted), so the values keep the full measure in the reading serif; narrower, each
 * label over its value.
 */
function Fields({ block, pdf }: { block: FieldsBlock; pdf: string | null }) {
  return (
    <dl className="grid max-w-measure grid-cols-1 xl:-ml-[12.5rem] xl:max-w-none xl:grid-cols-[9.5rem_minmax(0,34rem)] xl:gap-x-12 xl:gap-y-2.5 [&>div:first-child>dt]:mt-0">
      {block.items.map((item, i) => (
        <div key={i} className="contents">
          <dt className="mt-4 label xl:mt-0 xl:pt-[0.3125rem] xl:text-right xl:text-balance">
            {typeset(item.label)}
          </dt>
          <dd className="min-w-0 reading break-words">
            <InlineWithPages parts={item.c} pdf={pdf} />
          </dd>
        </div>
      ))}
    </dl>
  )
}

function Bullets({ block, pdf }: { block: BulletsBlock; pdf: string | null }) {
  return (
    <ul className="max-w-measure list-none space-y-2 reading">
      {block.items.map((item, i) => (
        <li
          key={i}
          className="relative pl-5 before:absolute before:left-0.5 before:text-muted-foreground before:content-['–']"
        >
          <InlineWithPages parts={item} pdf={pdf} />
        </li>
      ))}
    </ul>
  )
}
