"use client"

import { useQueryStates } from "nuqs"
import { useEffect, useMemo, useRef, useState, type RefObject } from "react"

import { Page } from "@/components/shell/page"
import { usePageShortcuts } from "@/components/shell/shortcuts"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useEntryFocus } from "@/hooks/use-entry-focus"
import {
  readArticleView,
  useLibrary,
  type ArticleEntry,
  type LibraryIndex,
  type Section,
} from "@/lib/data"
import { articleParams } from "@/lib/url-state"
import { cn } from "@/lib/utils"

import { ArticleProvider, type ArticleContextValue } from "./article-context"
import { ArticleFacts } from "./article-facts"
import { ArticleHeader } from "./article-header"
import {
  articleFacts,
  FACTS_BESIDE_TITLE,
  figuresOf,
  isQuietSection,
  keyMetricsSection,
} from "./article-model"
import { ArticleNotFound } from "./article-not-found"
import { Colophon } from "./colophon"
import { figureSource } from "./figure-block"
import { FigureLightbox } from "./figure-lightbox"
import { FiguresStrip } from "./figures-strip"
import { GlossedSection, SectionFrame } from "./glossed-section"
import { KeyMetricsSection } from "./key-metrics"
import { AT, GRID } from "./grid"
import { InlineWithPages } from "./inline-pages"
import { listPosition, readOrder } from "./list-position"
import { paperPdfHref, pdfIsManuscript } from "./page-refs"
import { SlimBar, useScrolledAway, type SectionEntry } from "./slim-bar"
import { UnreadableRecord } from "./unreadable-record"
import { ARTICLE_SHORTCUTS, useArticleKeys } from "./use-article-keys"
import { hashHeading, useArticleLanding } from "./use-landing"
import { usePageMarks } from "./use-page-marks"
import { useScrollSpy } from "./use-scroll-spy"

const TITLE_ID = "article-title"
const END_ID = "article-end"

/** The route "/article/?b=<bib>&k=<key>": the article the params name, or a helpful not-found. */
export function ArticleView() {
  const lib = useLibrary()
  const [{ b, k, from }] = useQueryStates(articleParams)
  const entry = lib.article(b, k)
  useDocumentTitle(entry ? entry.article.cite : "No such article")
  if (!entry) return <ArticleNotFound lib={lib} bib={b} articleKey={k} />
  // A new article is a new reader: its scroll-spy, figures and landing start afresh.
  return <ArticleReader key={entry.ref} entry={entry} lib={lib} from={from} />
}

/**
 * Signes de renvoi lit (`usePageMarks`): a page mark underlined in rubric, a note in ink with its
 * rule in rubric.
 */
const LIT_STYLE = cn(
  "[&_.page-mark[data-lit]]:underline [&_.page-mark[data-lit]]:decoration-rubric [&_.page-mark[data-lit]]:decoration-[1.5px]",
  "[&_[data-gloss-note]]:transition-[color,border-color] [&_[data-gloss-note]]:duration-150",
  "[&_[data-gloss-note][data-lit]]:border-rubric [&_[data-gloss-note][data-lit]]:text-foreground"
)

function ArticleReader({
  entry,
  lib,
  from,
}: {
  entry: ArticleEntry
  lib: LibraryIndex
  from: string
}) {
  const { article } = entry
  const { view, error } = readArticleView(article)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const rootRef = useRef<HTMLElement>(null)
  // The list's order is read once per article (sessionStorage: the browser only).
  const [order] = useState(() => readOrder(from))
  const place = listPosition(lib, entry, from, order)
  const pdf = view ? paperPdfHref(view) : null

  const { sections, metrics, others, figures } = useMemo(() => {
    const all = view?.sections ?? []
    const key = keyMetricsSection(all)
    const rest = all.filter((s) => s !== key)
    return {
      sections: all,
      metrics: key,
      others: rest,
      figures: figuresOf(key ? [key, ...rest] : rest),
    }
  }, [view])
  const figuresId = sections.some((s) => s.id === "figures") ? "figures-strip" : "figures"
  // The page's own bands (Key metrics moved up, Figures) have no number; the record's sections
  // are numbered from 1, in their order.
  const entries: SectionEntry[] = [
    ...(metrics ? [{ id: metrics.id, title: metrics.title, key: "m" }] : []),
    ...(figures.length > 0 ? [{ id: figuresId, title: "Figures", key: "f" }] : []),
    ...others.map((s, i) => ({ id: s.id, title: s.title, number: i + 1 })),
  ]
  const [active, setActive] = useScrollSpy(
    entries.map((e) => e.id),
    END_ID
  )

  const [citeOpen, setCiteOpen] = useState(false)
  const [figure, setFigure] = useState<number | null>(null)
  const [allMetrics, setAllMetrics] = useState(false)
  // The slim bar shows once the title has scrolled away; `c` then opens its Cite menu.
  const barShown = useScrolledAway(titleRef)

  usePageShortcuts(ARTICLE_SHORTCUTS)
  useArticleLanding(entry.ref)
  useEntryFocus(() => hashHeading() ?? titleRef.current)
  usePageMarks(rootRef)
  usePrintFrame(rootRef, article.cite)
  useArticleKeys({
    ref: entry.ref,
    place,
    from,
    pdf,
    metrics: metrics?.id ?? null,
    figures: figures.length > 0 ? figuresId : null,
    openCite: () => setCiteOpen(true),
    openMetrics: () => setAllMetrics(true),
  })

  const context = useMemo<ArticleContextValue>(
    () => ({
      pdf,
      card: article,
      manuscript: view ? pdfIsManuscript(view) : false,
      lookup: (bib, key) => lib.article(bib, key),
      openFigure: (src) => {
        const i = figures.findIndex((f) => figureSource(f.block).src === src)
        if (i >= 0) setFigure(i)
      },
    }),
    [pdf, article, view, lib, figures]
  )
  const facts = view ? articleFacts(view.glance, view.lab, metrics !== undefined) : []
  // The facts that do not fit beside the title go on beside the first section without notes.
  const continued = facts.slice(FACTS_BESIDE_TITLE)
  const quiet = continued.length > 0 ? others.find(isQuietSection) : undefined

  return (
    <ArticleProvider value={context}>
      <SlimBar
        article={article}
        shown={barShown}
        citeOpen={citeOpen}
        onCiteOpenChange={setCiteOpen}
        sections={entries}
        active={active}
        onPick={setActive}
        place={place}
        from={from}
      />
      <Page width="glossed">
        <article ref={rootRef} aria-labelledby={TITLE_ID} className={LIT_STYLE}>
          {/* The facts span the title, the lede and a last flexible row: they never push the lede. */}
          <div
            className={cn(
              GRID,
              "lg:grid-rows-[auto_auto_auto_1fr] print:grid-rows-[auto_auto_auto_1fr]"
            )}
          >
            <ArticleHeader
              entry={entry}
              view={view ?? undefined}
              place={place}
              from={from}
              titleRef={titleRef}
              citeOpen={!barShown && citeOpen}
              onCiteOpenChange={setCiteOpen}
              top={cn(AT.text, "lg:row-start-1")}
              main={cn(AT.text, "mt-2 lg:row-start-2")}
            />
            {view && view.lead.length > 0 ? (
              <p className={cn(AT.text, "mt-8 lede text-foreground lg:row-start-3")}>
                <InlineWithPages parts={view.lead} pdf={pdf} />
              </p>
            ) : null}
            {view ? (
              <ArticleFacts
                facts={facts}
                sections={sections}
                pdf={pdf}
                hiddenFrom={quiet ? FACTS_BESIDE_TITLE : undefined}
                className={cn(
                  AT.gloss,
                  "mt-8 lg:row-span-3 lg:row-start-2 lg:mt-2 lg:self-start print:row-span-3 print:row-start-2 print:mt-2"
                )}
              />
            ) : null}
            {view ? null : (
              <div className={cn(AT.text, "mt-10")}>
                <UnreadableRecord entry={entry} error={error} />
              </div>
            )}
          </div>

          {metrics ? (
            <KeyMetricsSection
              section={metrics}
              pdf={pdf}
              open={allMetrics}
              onOpenChange={setAllMetrics}
            />
          ) : null}
          {figures.length > 0 ? (
            <SectionFrame id={figuresId} title="Figures" className="print:hidden">
              <div className={cn(AT.wide, "xl:row-start-1")}>
                <FiguresStrip figures={figures} onOpen={setFigure} />
              </div>
            </SectionFrame>
          ) : null}
          {others.map((section: Section, i) => (
            <GlossedSection
              key={section.id}
              section={section}
              number={i + 1}
              pdf={pdf}
              aside={
                section === quiet ? (
                  <ArticleFacts continued facts={continued} sections={sections} pdf={pdf} />
                ) : undefined
              }
            />
          ))}

          {view ? (
            <div className={cn(GRID, "mt-16")}>
              <Colophon entry={entry} footer={view.footer} className={AT.text} />
            </div>
          ) : null}
          {/*
            Room after the colophon, so a jump to one of the last sections lands it under the bars
            like any other (the page would end first), and the slim bar names the section chosen.
          */}
          <div
            aria-hidden="true"
            className="h-[max(0px,calc(100svh-var(--header-height)-2.5rem-20rem))] print:hidden"
          />
          <div id={END_ID} aria-hidden="true" className="h-px" />
        </article>
      </Page>
      <FigureLightbox figures={figures} index={figure} onIndexChange={setFigure} pdf={pdf} />
    </ArticleProvider>
  )
}

/**
 * Print: the running head is the article's cite (`--print-head`). Of the folded detail only Key
 * metrics' full table prints open (`data-print-open`: the results and their evidence); the folded
 * sections (sources and provenance, long detail) print as their summary
 * line, as on screen, so the summary prints in a few pages rather than twenty.
 */
function usePrintFrame(root: RefObject<HTMLElement | null>, cite: string): void {
  useEffect(() => {
    const html = document.documentElement
    html.style.setProperty("--print-head", JSON.stringify(cite))
    let opened: HTMLDetailsElement[] = []
    const before = () => {
      opened = [
        ...(root.current?.querySelectorAll<HTMLDetailsElement>(
          "details[data-print-open]:not([open])"
        ) ?? []),
      ]
      for (const d of opened) d.open = true
    }
    const after = () => {
      for (const d of opened) d.open = false
      opened = []
    }
    window.addEventListener("beforeprint", before)
    window.addEventListener("afterprint", after)
    return () => {
      html.style.removeProperty("--print-head")
      window.removeEventListener("beforeprint", before)
      window.removeEventListener("afterprint", after)
    }
  }, [root, cite])
}
