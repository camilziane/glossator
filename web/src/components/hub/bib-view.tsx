"use client"

import { createSerializer, useQueryStates } from "nuqs"
import { useEffect } from "react"

import { DataProblems } from "@/components/shell/data-problems"
import { NotInLibrary } from "@/components/shell/not-in-library"
import { Page } from "@/components/shell/page"
import { usePageShortcuts, type ShortcutSection } from "@/components/shell/shortcuts"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useFromHere } from "@/hooks/use-list-memory"
import { useLibrary, type Bibliography } from "@/lib/data"
import { formatNumber } from "@/lib/format"
import { routes } from "@/lib/routes"
import { bibParams } from "@/lib/url-state"

import { ArticlesTable } from "./articles-table"
import { BibHeader } from "./bib-header"
import { HubLinksContext, type HubLinks } from "./hub-context"
import { hubModel } from "./model"
import { OtherTable } from "./other-table"
import { ARTICLE_TABLE_OPTIONS, articleTableParams } from "./url-state"
import { useHash } from "./use-hash"

/** A hub's keys, as the shortcuts dialog lists them (data-table.tsx and articles-table.tsx). */
const HUB_SHORTCUTS: ShortcutSection = {
  title: "Bibliography",
  shortcuts: [
    { keys: [["/"]], label: "Filter the table" },
    { keys: [["Esc"]], label: "In the filter: clear it, then leave it" },
    { keys: [["↑"], ["↓"]], label: "Move between rows (the preview follows)" },
    { keys: [["←"], ["→"]], label: "Move across a row’s cells; a cut one shows its whole text" },
    { keys: [["PgUp"], ["PgDn"]], label: "Move ten rows" },
    { keys: [["Home"], ["End"]], label: "First or last row" },
    { keys: [["Space"]], label: "Preview the row’s article, or close the preview" },
    { keys: [["Enter"]], label: "Open the row’s article" },
    { keys: [["mod", "Enter"]], label: "Open it in a new tab" },
    { keys: [["p"]], label: "Open the row’s PDF" },
    { keys: [["c"]], label: "Cite the row’s article" },
    { keys: [["Esc"]], label: "Close the preview, keeping the row" },
  ],
}

const serializeTable = createSerializer(articleTableParams)

/** "/bib/?b=<name>": a bibliography's hub, its tables as tabs (the hash names the one shown). */
export function BibView() {
  const lib = useLibrary()
  const [{ b }] = useQueryStates(bibParams)
  const bib = lib.bib(b)
  useDocumentTitle(bib ? bib.title : "No such bibliography")
  usePageShortcuts(HUB_SHORTCUTS)
  if (!bib) return <NotInLibrary what="bibliography" name={b} />
  return <BibHub key={bib.name} bib={bib} />
}

function BibHub({ bib }: { bib: Bibliography }) {
  const model = hubModel(bib)
  const [hash, setHash] = useHash()
  const [, setParams] = useQueryStates(articleTableParams, ARTICLE_TABLE_OPTIONS)
  const from = useFromHere()
  const tables = [model.articles, ...model.others]
  const first = model.articles.id
  const active = tables.some((t) => t.id === hash) ? hash : first

  // The printed pages' running head.
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty("--print-head", JSON.stringify(bib.title))
    return () => {
      root.style.removeProperty("--print-head")
    }
  }, [bib.title])

  const links: HubLinks = {
    bib: bib.name,
    from,
    tags: new Set(model.facets.tags.map((t) => t.value)),
    tagHref: (tag) => serializeTable(routes.bib(bib.name), { tag: [tag] }),
  }

  const showArticles = (change: Parameters<typeof setParams>[0]) => {
    setHash("")
    void setParams(change)
  }

  return (
    <HubLinksContext value={links}>
      <Page width="full" className="print-wide">
        <BibHeader
          bib={bib}
          stats={model.stats}
          filters={{
            notice: (level) => showArticles({ notice: [level] }),
            drafts: () => showArticles({ status: ["draft"] }),
          }}
        />
        <DataProblems
          only={(p) => p.ref === bib.name || p.ref.startsWith(`${bib.name}/`)}
          className="mb-4"
        />
        <Tabs
          value={active}
          onValueChange={(id) => setHash(id === first ? "" : id)}
          className="gap-4"
        >
          {tables.length > 1 ? (
            <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" data-print="hide">
              <TabsList aria-label="Tables" className="min-w-full">
                {tables.map((t) => (
                  <TabsTrigger key={t.id} value={t.id}>
                    {t.title}
                    <span className="text-small font-normal text-muted-foreground num">
                      {formatNumber(t.rows.length)}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
          ) : null}
          {/* A panel is not a tab stop: its table's controls are (a focusable panel showed no ring). */}
          <TabsContent value={model.articles.id} tabIndex={-1}>
            <ArticlesTable bib={bib} model={model} />
          </TabsContent>
          {model.others.map((t) => (
            <TabsContent key={t.id} value={t.id} tabIndex={-1}>
              <OtherTable model={t} bibTitle={bib.title} />
            </TabsContent>
          ))}
        </Tabs>
      </Page>
    </HubLinksContext>
  )
}
