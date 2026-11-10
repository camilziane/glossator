"use client"

import Link from "next/link"
import { Fragment } from "react"

import { cn } from "@/lib/utils"

import { type SentencePart } from "./today-data"

/**
 * Today's opening sentence, the page's h1, set as a lede: what the library holds and what the inbox
 * found. Its links are whole phrases ("26 new papers", "11 of them in scope"), the new count in
 * rubric like the top bar's.
 */
export function TodaySentence({
  parts,
  id,
  className,
}: {
  parts: readonly SentencePart[]
  id?: string
  className?: string
}) {
  return (
    <h1 id={id} className={cn("lede hyphens-none text-foreground", className)}>
      {parts.map((part, i) =>
        typeof part === "string" ? (
          <Fragment key={i}>{part}</Fragment>
        ) : (
          <Link
            key={i}
            href={part.href}
            data-today-row={`sentence:${i}`}
            className={cn("rounded-[2px] link", part.news && "font-semibold")}
          >
            <span className={cn(part.news && "text-rubric")}>{part.figure}</span> {part.words}
          </Link>
        )
      )}
    </h1>
  )
}
