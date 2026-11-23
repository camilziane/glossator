"use client"

import type { ReactNode } from "react"

import { IdentityLabel } from "@/components/content/identity"
import {
  plainText,
  type Block,
  type BulletsBlock,
  type FieldsBlock,
  type ParagraphBlock,
} from "@/lib/data"
import { labelIdentity } from "@/lib/identity"
import { typeset } from "@/lib/typeset"
import { cn } from "@/lib/utils"

import { useArticleContext } from "./article-context"
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
  /** The section's id: a label its profile leaves out takes the section's family. */
  section?: string
  className?: string
}

/**
 * Blocks in their order (sitedata.blocks): paragraphs, sub-headings, fields, bullets, tables, figures,
 * and quotes and sources as notes after the text they gloss (folded detail, a group of a section).
 */
export function Blocks({
  blocks,
  pdf = null,
  label,
  notes = "inline",
  section,
  className,
}: BlocksProps) {
  const tableLabel = tableLabels(blocks, label)
  return (
    <div className={cn("flow-root space-y-5", className)}>
      {blocks.map((block, i) => (
        <BlockView
          key={i}
          block={block}
          pdf={pdf}
          label={tableLabel[i]}
          notes={notes}
          section={section}
        />
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
  section,
}: {
  block: Block
  pdf: string | null
  label?: string
  notes?: NoteLayout
  /** The section's id (its fields' labels take its family when their profile leaves them out). */
  section?: string
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
      return <Fields block={block} pdf={pdf} section={section} />
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

/** A field's value that says nothing is known: listed once, after the others. */
const UNKNOWN = /^(?:not reported|not applicable|not stated|unknown)\.?$/iu
/** A value short enough for the grid: a few words, no link, no sentence. */
const SHORT_CHARS = 48

type FieldItem = FieldsBlock["items"][number]

/** How a field reads best: in the grid of short values, as a paragraph, or in the unknowns' line. */
export function fieldShape(item: FieldItem): "short" | "long" | "unknown" {
  const text = plainText(item.c).trim()
  if (UNKNOWN.test(text)) return "unknown"
  const plain = item.c.every((p) => typeof p === "string" || (p.t !== "a" && p.t !== "art"))
  const sentences = /[;]|[.!?]\s+\p{Lu}/u.test(text)
  return plain && text.length <= SHORT_CHARS && !sentences ? "short" : "long"
}

/**
 * Label and value pairs, each label over its value and marked by its identity (its icon and its
 * family's ink, `@/lib/identity`). The short values first, side by side in a grid ("Loop ·
 * Offline"); then the paragraphs in their order; then, in one quiet line, what is not reported.
 */
function Fields({
  block,
  pdf,
  section,
}: {
  block: FieldsBlock
  pdf: string | null
  section?: string
}) {
  const { identities } = useArticleContext()
  const shaped = block.items.map((item) => ({ item, shape: fieldShape(item) }))
  const of = (shape: string) => shaped.filter((f) => f.shape === shape).map((f) => f.item)
  const [short, long, unknown] = [of("short"), of("long"), of("unknown")]
  const label = (item: FieldItem) => (
    <IdentityLabel identity={labelIdentity(identities, item.label, section)}>
      {typeset(item.label)}
    </IdentityLabel>
  )
  // "Not reported: Causal, Parameters · Not applicable: Loop", in the record's words.
  const said = new Map<string, string[]>()
  for (const item of unknown) {
    const word = plainText(item.c).trim().replace(/\.$/u, "").toLowerCase()
    said.set(word, [...(said.get(word) ?? []), item.label])
  }
  return (
    <div className="max-w-measure space-y-5">
      {short.length > 0 ? (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3.5 sm:grid-cols-3">
          {short.map((item, i) => (
            <div key={i} className="min-w-0">
              <dt>{label(item)}</dt>
              <dd className="mt-0.5 font-serif text-note text-pretty break-words">
                <InlineWithPages parts={item.c} pdf={pdf} />
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {long.length > 0 ? (
        <dl className="space-y-5">
          {long.map((item, i) => (
            <div key={i}>
              <dt>{label(item)}</dt>
              <dd className="mt-1 min-w-0 reading break-words">
                <InlineWithPages parts={item.c} pdf={pdf} />
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {said.size > 0 ? (
        <p data-unknown-fields="" className="font-sans text-small text-muted-foreground">
          {[...said].map(([word, labels], i) => (
            <span key={word}>
              {i > 0 ? " · " : null}
              {word.charAt(0).toUpperCase() + word.slice(1)}:{" "}
              {labels.map((l) => typeset(l)).join(", ")}
            </span>
          ))}
        </p>
      ) : null}
    </div>
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
