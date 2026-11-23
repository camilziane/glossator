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
import { APP, sectionIdentity } from "@/lib/identity"
import { articleParams } from "@/lib/url-state"
import { cn } from "@/lib/utils"

import { ArticleProvider, type ArticleContextValue } from "./article-context"
import { ArticleFacts } from "./article-facts"
import { ArticleHeader } from "./article-header"
import { factsOf, figuresOf, keyMetricsSection } from "./article-model"
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
 * Signes de renvoi lit (`usePageMarks`): a page mark in ink, underlined in ink; a note in ink with
 * its rule in ink.
 */
const LIT_STYLE = cn(
  "[&_.page-mark[data-lit]]:text-foreground [&_.page-mark[data-lit]]:underline [&_.page-mark[data-lit]]:decoration-foreground [&_.page-mark[data-lit]]:decoration-[1.5px]",
  "[&_[data-gloss-note]]:transition-[color,border-color] [&_[data-gloss-note]]:duration-150",
  "[&_[data-gloss-note][data-lit]]:border-foreground [&_[data-gloss-note][data-lit]]:text-foreground"
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
  // Each section with its identity (its icon in the slim bar); the page's own bands (Key metrics
  // moved up, Figures) have their keys.
  const identities = entry.bib.identities
  const entries: SectionEntry[] = [
    ...(metrics
      ? [
          {
            id: metrics.id,
            title: metrics.title,
            key: "m",
            identity: sectionIdentity(identities, metrics.id),
          },
        ]
      : []),
    ...(figures.length > 0
      ? [{ id: figuresId, title: "Figures", key: "f", identity: APP.figures }]
      : []),
    ...others.map((s) => ({
      id: s.id,
      title: s.title,
      identity: sectionIdentity(identities, s.id),
    })),
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
      identities,
    }),
    [pdf, article, view, lib, figures, identities]
  )
  const facts = view ? factsOf(view.glance, metrics !== undefined) : []

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
      <Page width="column">
        <article ref={rootRef} aria-labelledby={TITLE_ID} className={LIT_STYLE}>
          <div className={GRID}>
            <ArticleHeader
              entry={entry}
              view={view ?? undefined}
              place={place}
              from={from}
              titleRef={titleRef}
              citeOpen={!barShown && citeOpen}
              onCiteOpenChange={setCiteOpen}
            />
            {view && view.lead.length > 0 ? (
              <p className={cn(AT.text, "mt-8 lede text-foreground")}>
                <InlineWithPages parts={view.lead} pdf={pdf} />
              </p>
            ) : null}
            {view ? (
              <ArticleFacts
                facts={facts}
                sections={sections}
                pdf={pdf}
                className={cn(AT.gloss, "mt-8")}
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
            <SectionFrame
              id={figuresId}
              title="Figures"
              identity={APP.figures}
              className="print:hidden"
            >
              <div className={AT.wide}>
                <FiguresStrip figures={figures} onOpen={setFigure} />
              </div>
            </SectionFrame>
          ) : null}
          {others.map((section: Section) => (
            <GlossedSection key={section.id} section={section} pdf={pdf} />
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
