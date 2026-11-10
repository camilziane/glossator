"use client"

import { InlineCommand } from "@/components/content/cli-command"
import { formatCount } from "@/lib/format"
import { useLibrary, type DataProblem } from "@/lib/data"
import { commands } from "@/lib/site"
import { cn } from "@/lib/utils"

/**
 * What the data holds that this app could not read (an article, a table, an inbox paper or a whole
 * bibliography that does not follow the format): left out of the pages, and said here, quietly,
 * with the refs and the details one click away. Nothing when everything was read.
 */
export function DataProblems({
  only,
  className,
}: {
  /** Which problems this page is about (its bibliography, the inbox); every one by default. */
  only?: (problem: DataProblem) => boolean
  className?: string
}) {
  const lib = useLibrary()
  const problems = only ? lib.problems.filter(only) : lib.problems
  if (!problems.length) return null
  const shown = problems.slice(0, 8)
  return (
    // A note in the page like an `Alert`: a hairline on its left, the words in ink, no box, no icon.
    <details
      className={cn("group/problems border-l-2 border-rule-strong py-0.5 pl-3 text-sm", className)}
    >
      <summary className="w-fit cursor-pointer list-none rounded-[2px] text-pretty text-foreground [&::-webkit-details-marker]:hidden">
        {formatCount(problems.length, "record")} could not be read and{" "}
        {problems.length === 1 ? "is" : "are"} left out:{" "}
        <span className="font-mono text-kbd text-muted-foreground">
          {shown.map((p) => p.ref).join(", ")}
        </span>
        {problems.length > shown.length ? " and more" : null}.{" "}
        <span className="whitespace-nowrap text-muted-foreground underline decoration-[color-mix(in_oklab,var(--rubric)_55%,transparent)] underline-offset-[0.18em] group-open/problems:hidden">
          Details
        </span>
      </summary>
      <div className="mt-2 space-y-2 text-muted-foreground">
        <p className="text-pretty">
          The data does not follow the format this app reads for these. Check them with{" "}
          <InlineCommand>{commands.checkAll}</InlineCommand>, fix them, then run{" "}
          <InlineCommand>{commands.build}</InlineCommand>.
        </p>
        <ul className="space-y-1.5">
          {problems.map((p) => (
            <li key={`${p.kind} ${p.ref}`}>
              <span className="font-medium text-foreground">
                {p.kind} <span className="font-mono text-kbd">{p.ref}</span>
              </span>
              <pre className="mt-0.5 overflow-x-auto font-mono text-kbd whitespace-pre-wrap">
                {p.detail}
              </pre>
            </li>
          ))}
        </ul>
      </div>
    </details>
  )
}
