"use client"

import Link from "next/link"
import { useRef, type RefObject } from "react"

import { CiteLine } from "@/components/content/cite"
import { CiteMenu } from "@/components/content/cite-menu"
import { InlineContent } from "@/components/content/inline"
import { DraftBadge, NoticeBadges } from "@/components/content/notice-badge"
import { Typeset } from "@/components/content/typeset"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { guessLang } from "@/lib/lang"
import { routes } from "@/lib/routes"
import { cn } from "@/lib/utils"

import { MetricText } from "./cells"
import { type ArticleRow } from "./model"
import { previewOf } from "./preview-model"

export interface PreviewProps {
  row: ArticleRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The phone's sheet comes from the bottom and is modal; the desktop's drawer is neither. */
  side: "right" | "bottom"
  bib: string
  from: string | null
  /** The Cite menu, opened with `c`. */
  citeOpen: boolean
  onCiteOpenChange: (open: boolean) => void
  /** Clicks and focus here (the table) do not close the drawer: they change its row. */
  keepOpenWithin: RefObject<HTMLElement | null>
  /** The drawer closed: where the focus goes back (the row). */
  onClosed: () => void
  /** The drawer's first control, for Tab from the row. */
  firstControl?: RefObject<HTMLAnchorElement | null>
}

/**
 * The preview of an article: a 440 px drawer on the right (a bottom sheet on phones) with its
 * one-liner, key metrics and figures, and Open (Enter) · PDF (p) · Cite (c). On wide screens it
 * leaves the table usable: the focus stays on the row, ↑ ↓ change what it shows, Esc closes it (it
 * is a complementary region, not a modal dialog).
 */
export function Preview({
  row,
  open,
  onOpenChange,
  side,
  bib,
  from,
  citeOpen,
  onCiteOpenChange,
  keepOpenWithin,
  onClosed,
  firstControl,
}: PreviewProps) {
  const desktop = side === "right"
  const ownFirst = useRef<HTMLAnchorElement>(null)
  const first = firstControl ?? ownFirst
  return (
    <Sheet open={open && row !== null} onOpenChange={onOpenChange} modal={!desktop}>
      <SheetContent
        side={side}
        // A drawer beside the table: a region of the page (the shell's keys and `?` keep working),
        // not a dialog that would hold the focus. The phone's sheet stays a dialog (an undefined
        // role would erase Radix's).
        {...(desktop ? { role: "region" } : {})}
        data-print="hide"
        onOpenAutoFocus={(e) => {
          if (desktop) e.preventDefault()
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          onClosed()
        }}
        onInteractOutside={(e) => {
          const target = e.target
          if (target instanceof Node && keepOpenWithin.current?.contains(target)) e.preventDefault()
        }}
        // Esc closes the Cite menu, a second Esc the drawer, however quick: while the menu fades out
        // it is still the top layer and would take that second Esc for itself.
        onKeyDown={(e) => {
          if (e.key === "Escape" && !citeOpen && open) onOpenChange(false)
        }}
        className={cn(
          "gap-0 p-0",
          desktop
            ? "top-(--header-height)! h-[calc(100dvh-var(--header-height))]! border-border"
            : "max-h-[88svh]"
        )}
      >
        {row ? (
          <PreviewBody
            row={row}
            bib={bib}
            from={from}
            citeOpen={citeOpen}
            onCiteOpenChange={onCiteOpenChange}
            first={first}
            desktop={desktop}
          />
        ) : (
          <SheetTitle className="sr-only">Preview</SheetTitle>
        )}
      </SheetContent>
    </Sheet>
  )
}

function PreviewBody({
  row,
  bib,
  from,
  citeOpen,
  onCiteOpenChange,
  first,
  desktop,
}: {
  row: ArticleRow
  bib: string
  from: string | null
  citeOpen: boolean
  onCiteOpenChange: (open: boolean) => void
  first: RefObject<HTMLAnchorElement | null>
  desktop: boolean
}) {
  const article = row.article
  const preview = article ? previewOf(article) : null
  const href = row.key ? routes.article(bib, row.key, undefined, { from }) : null
  const sectionHref = (section: string) =>
    row.key ? routes.article(bib, row.key, section, { from }) : undefined
  const lang = guessLang(row.title)

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pt-6 pb-8">
        <SheetTitle asChild>
          <h2 className="pr-8 title" lang={lang}>
            <Typeset text={row.title} lang={lang} acronyms />
          </h2>
        </SheetTitle>
        <SheetDescription asChild>
          <p className="mt-1.5 font-serif text-ui text-muted-foreground [font-variant-numeric:oldstyle-nums_proportional-nums]">
            {article ? <CiteLine card={article} /> : row.cite}
            {row.notices.length || row.status === "draft" ? (
              <>
                <span aria-hidden>{" · "}</span>
                <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
                  {row.notices.length ? <NoticeBadges notices={row.notices} /> : null}
                  {row.status === "draft" ? <DraftBadge /> : null}
                </span>
              </>
            ) : null}
          </p>
        </SheetDescription>

        {preview?.lede.length ? (
          <p className="mt-5 reading" lang={guessLang(plainLede(preview.lede))}>
            <InlineContent parts={preview.lede} lang={guessLang(plainLede(preview.lede))} />
          </p>
        ) : null}
        {preview?.error ? (
          <p className="mt-5 font-serif text-note text-muted-foreground">
            Its record could not be read: the article’s page says what is wrong.
          </p>
        ) : null}

        {preview?.metrics ? (
          <section aria-labelledby="hub-preview-metrics" className="mt-7">
            <h3 id="hub-preview-metrics" className="mb-1.5 label">
              {row.key ? (
                <Link
                  href={sectionHref(preview.metrics.section)!}
                  className="hover:text-foreground"
                >
                  Key metrics
                </Link>
              ) : (
                "Key metrics"
              )}
            </h3>
            <ul className="font-sans text-table [font-stretch:92%]">
              {preview.metrics.rows.map((m, i) => (
                <li key={i} className="border-t border-border py-2 first:border-t-0 first:pt-1">
                  <p className="text-foreground">
                    <InlineContent parts={m.metric} context="cell" />
                  </p>
                  <p className="mt-0.5">
                    <span className="text-foreground num">
                      <MetricText parts={m.value} everywhere />
                    </span>
                    {m.condition.length ? (
                      <span className="text-muted-foreground">
                        {" · "}
                        <InlineContent parts={m.condition} context="cell" />
                      </span>
                    ) : null}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {preview?.figures.length ? (
          <section aria-labelledby="hub-preview-figures" className="mt-7">
            <h3 id="hub-preview-figures" className="mb-2 label">
              Figures
            </h3>
            <ul className="grid grid-cols-3 gap-2">
              {preview.figures.map((figure) => (
                <li key={figure.src}>
                  <Link
                    href={sectionHref(figure.section) ?? figure.src}
                    tabIndex={desktop ? -1 : undefined}
                    className="block border border-border bg-background p-1 transition-colors duration-150 hover:border-input"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- a local file served beside the app */}
                    <img
                      src={figure.src}
                      alt={figure.alt}
                      loading="lazy"
                      className="aspect-[4/3] w-full object-contain"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      <div className="flex items-center gap-2 border-t border-border bg-popover px-6 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {href ? (
          // The main action, quiet like the others (no ink slab): its hairline and its word.
          <Button asChild size="sm" className="px-3">
            <Link ref={first} href={href} aria-keyshortcuts="Enter">
              Open
              <Kbd hint>Enter</Kbd>
            </Link>
          </Button>
        ) : null}
        {preview?.pdf ? (
          <Button asChild size="sm">
            <a href={preview.pdf} target="_blank" rel="noopener noreferrer" aria-keyshortcuts="p">
              PDF
              <Kbd hint>p</Kbd>
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </Button>
        ) : (
          <span className="px-1 text-small text-muted-foreground">No PDF here</span>
        )}
        {article ? (
          <CiteMenu
            card={article}
            size="sm"
            keyHint="c"
            open={citeOpen}
            onOpenChange={onCiteOpenChange}
            align="end"
            className="ml-auto"
          />
        ) : null}
      </div>
    </>
  )
}

function plainLede(parts: readonly (string | { text: string })[]): string {
  return parts.map((p) => (typeof p === "string" ? p : p.text)).join("")
}
