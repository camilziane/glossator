"use client"

import { useRef } from "react"

import { RelevanceMark } from "@/components/content/relevance"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { formatCount } from "@/lib/format"
import type { Decision } from "@/lib/inbox-decisions"
import { guessLang } from "@/lib/lang"
import { commands } from "@/lib/site"
import { typeset } from "@/lib/typeset"

import type { InboxRow } from "./inbox-model"

export interface DecisionRequest {
  decision: Decision
  rows: InboxRow[]
}

const SHOWN = 6

/** Asks before a decision on several papers at once (an alert dialog: it changes the library). */
export function ConfirmDecisionDialog({
  request,
  onCancel,
  onConfirm,
  onCloseAutoFocus,
}: {
  request: DecisionRequest | null
  onCancel: () => void
  onConfirm: (request: DecisionRequest) => void
  onCloseAutoFocus: (e: Event) => void
}) {
  const confirmRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const n = request?.rows.length ?? 0
  const accept = request?.decision === "accept"
  const papers = formatCount(n, "paper")
  return (
    <AlertDialog open={request !== null} onOpenChange={(open) => (open ? null : onCancel())}>
      <AlertDialogContent
        className="data-[size=default]:max-w-[calc(100%-2rem)] data-[size=default]:sm:max-w-lg"
        onCloseAutoFocus={onCloseAutoFocus}
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          // Accepting is the usual move; rejecting deletes files, so it starts on Cancel.
          const first = accept ? confirmRef : cancelRef
          first.current?.focus()
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>
            {accept ? "Accept" : "Reject"} {papers}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {accept ? (
              <>
                They stay in the inbox as accepted until{" "}
                <code className="whitespace-nowrap text-foreground">{commands.addAccepted}</code>{" "}
                adds them to their bibliographies.
              </>
            ) : (
              "They leave the inbox, and the PDFs it downloaded for them are deleted from this computer."
            )}{" "}
            The decision is committed to the inbox&apos;s history.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {request ? (
          <ul className="max-h-64 divide-y divide-border overflow-y-auto border-y border-border">
            {request.rows.slice(0, SHOWN).map(({ paper }) => (
              <li key={paper.id} className="flex items-start gap-2.5 py-2">
                <RelevanceMark
                  value={paper.triage.relevance}
                  className="h-5 w-4 shrink-0 justify-center"
                />
                <span lang={guessLang(paper.title)} className="min-w-0 item-title text-item">
                  {typeset(paper.title, guessLang(paper.title))}
                </span>
              </li>
            ))}
            {n > SHOWN ? (
              <li className="py-2 pl-6.5 font-sans text-sm text-muted-foreground">
                and {formatCount(n - SHOWN, "more paper")}
              </li>
            ) : null}
          </ul>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel ref={cancelRef}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            ref={confirmRef}
            variant={accept ? "outline" : "destructive"}
            onClick={() => request && onConfirm(request)}
          >
            {accept ? "Accept" : "Reject"} {papers}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
