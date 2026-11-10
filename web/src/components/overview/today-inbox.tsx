"use client"

import Link from "next/link"

import { CliCommand } from "@/components/content/cli-command"
import { RelevanceMark } from "@/components/content/relevance"
import { Typeset } from "@/components/content/typeset"
import { Button } from "@/components/ui/button"
import { type InboxPaper, type LibraryIndex } from "@/lib/data"
import { formatShortDate, shortVenue } from "@/lib/format"
import { type InboxView } from "@/lib/inbox-views"
import { guessLang } from "@/lib/lang"
import { routes } from "@/lib/routes"
import { commands } from "@/lib/site"
import { cn } from "@/lib/utils"

import { type InboxDigest } from "./today-data"
import { TODAY_MARK, TODAY_ROW, TODAY_ROW_LINK, TODAY_TEXT } from "./today-grid"

const HEADINGS: Record<InboxView, string> = {
  new: "New in the inbox",
  worth: "Worth a look",
  waiting: "Waiting in the inbox",
  accepted: "Accepted",
}

/**
 * The inbox on Today: the best papers of the view it opens on (the latest run's, else those worth a
 * look), each a row that opens it in the inbox, and the way into the morning's triage (focused on
 * arrival: Enter starts it; `g i` from any page). The count is the sentence's, said once. Without
 * papers to decide, or without an inbox, a sentence says what to do.
 */
export function TodayInbox({
  lib,
  digest,
  className,
}: {
  lib: LibraryIndex
  digest: InboxDigest
  className?: string
}) {
  const { view, papers } = digest
  const heading = view ? HEADINGS[view] : "Inbox"
  return (
    <section aria-labelledby="today-inbox" className={cn(TODAY_ROW, className)}>
      <h2
        id="today-inbox"
        className={cn(TODAY_TEXT, "mb-1 font-serif text-read font-semibold text-foreground")}
      >
        {heading}
      </h2>
      {!lib.inbox ? (
        <NoInbox />
      ) : view === null ? (
        <NothingWaits />
      ) : (
        <>
          <ol className={cn(TODAY_ROW, "hyphens-none")}>
            {papers.map((paper) => (
              <PaperRow key={paper.id} paper={paper} view={view} lib={lib} />
            ))}
          </ol>
          <p className={cn(TODAY_TEXT, "mt-4")}>
            <Button asChild>
              <Link href={routes.inbox({ view })} data-today-row="triage">
                Start triage
              </Link>
            </Button>
          </p>
        </>
      )}
    </section>
  )
}

/** A paper of the list: its relevance in the margin, its title, one meta line. */
function PaperRow({ paper, view, lib }: { paper: InboxPaper; view: InboxView; lib: LibraryIndex }) {
  const target = paper.triage.bib && paper.triage.bib !== "none" ? lib.bib(paper.triage.bib) : null
  const kind = paper.triage.kind?.replaceAll("_", " ").trim().toLowerCase()
  const venue = shortVenue(paper.venue)
  const meta = [target ? target.short || target.name : null, kind || null, venue || null]
  const title = paper.title || paper.id
  const lang = guessLang(paper.title)
  return (
    <li className={TODAY_ROW}>
      <div className={cn(TODAY_TEXT, "relative isolate min-w-0 py-2")}>
        <RelevanceMark value={paper.triage.relevance} className={TODAY_MARK} />
        <Link
          href={routes.inbox({ view, paper: paper.id })}
          data-today-row={`paper:${paper.id}`}
          lang={lang}
          className={cn("block rounded-[2px] item-title text-item text-foreground", TODAY_ROW_LINK)}
        >
          <span className="clamp-fade-4 md:clamp-fade-3">
            <Typeset text={title} lang={lang} />
          </span>
        </Link>
        <p className="mt-0.5 text-small text-muted-foreground">
          {meta.filter(Boolean).join(" · ")}
          {paper.date ? (
            <>
              {meta.some(Boolean) ? " " : null}
              {/* The date never starts a line with its separator. */}
              <span className="whitespace-nowrap">
                {meta.some(Boolean) ? "· " : null}
                <time dateTime={paper.date}>{formatShortDate(paper.date)}</time>
              </span>
            </>
          ) : null}
        </p>
      </div>
    </li>
  )
}

function NothingWaits() {
  return (
    <div className={cn(TODAY_TEXT, "font-serif text-note text-muted-foreground")}>
      <p className="text-pretty">
        Nothing waits for a decision. The daily run files new papers here; to run it now:
      </p>
      <CliCommand command={commands.inboxRun} className="mt-2" />
    </div>
  )
}

function NoInbox() {
  return (
    <div className={cn(TODAY_TEXT, "font-serif text-note text-muted-foreground")}>
      <p className="text-pretty">
        <span className="font-semibold text-foreground">No inbox on this computer.</span> The inbox
        searches the literature every day and files the new papers close to your bibliographies, for
        you to accept or reject. Set it up, then schedule its daily run:
      </p>
      <div className="mt-2 flex flex-col items-start gap-1.5">
        <CliCommand command={commands.inboxInit} />
        <CliCommand command={commands.inboxStart} />
      </div>
    </div>
  )
}
