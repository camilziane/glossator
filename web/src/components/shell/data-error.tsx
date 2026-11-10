"use client"

import type { ReactNode } from "react"

import { isLibraryError, LIBRARY_URL, type LibraryErrorKind } from "@/lib/data"
import { CLI_NAME, commands } from "@/lib/site"
import { cn } from "@/lib/utils"

import { Page } from "./page"

interface Explained {
  title: string
  /** One sentence: why, and what to do. */
  body: ReactNode
  /** The command that mends it, in mono. */
  command?: string
}

/** The HTTP status in a library error ("…answered 500…", "…(502)."), when there is one. */
export function errorStatus(error: unknown): number | null {
  if (typeof error === "object" && error !== null && "status" in error) {
    const status = (error as { status: unknown }).status
    if (typeof status === "number") return status
  }
  const message = error instanceof Error ? error.message : ""
  const match = /(?:answered |\()([1-5]\d\d)\b/.exec(message)
  return match ? Number(match[1]) : null
}

/** What went wrong, in the app's words: the request failed vs. the server answered an error. */
export function explainError(error: unknown): Explained {
  const kind: LibraryErrorKind | "unknown" = isLibraryError(error) ? error.kind : "unknown"
  const message = error instanceof Error ? error.message : String(error ?? "")
  // A 5xx with the server's own words is glossator serve's; without them it is the dev server's proxy
  // finding nobody (or a host that is not glossator serve): no answer from glossator serve.
  const said = isLibraryError(error) && Boolean(error.detail)
  const status = kind === "http" || (kind === "unreachable" && said) ? errorStatus(error) : null
  if (status !== null) {
    return {
      title: `${CLI_NAME} serve answered ${status} — see its terminal`,
      body: (
        <>
          It could not give the library’s data ({LIBRARY_URL}); its terminal says why. Then try
          again.
        </>
      ),
    }
  }
  switch (kind) {
    case "unreachable":
      return {
        title: `No answer from ${CLI_NAME} serve`,
        body: (
          <>
            The app reads the library from it: start it in the folder of your bibliographies, then
            try again.
          </>
        ),
        command: commands.serve,
      }
    case "missing":
      return {
        title: "No library data yet",
        body: <>Write the data the app reads ({LIBRARY_URL}), then try again.</>,
        command: commands.build,
      }
    case "version":
      return {
        title: "The app and the data are out of step",
        body: (
          <>
            {message} Rebuild the data (or the app, with {commands.web}) so that they match.
          </>
        ),
        command: commands.build,
      }
    case "invalid":
      return {
        title: "The library data could not be read",
        body: (
          <>
            {message} Rebuild it; if this persists, rebuild the app as well ({commands.web}).
          </>
        ),
        command: commands.build,
      }
    default:
      return {
        title: "Something went wrong",
        body: (
          <>
            {message || "An unexpected error stopped this page."} Reload it; if it happens again,
            rebuild the app.
          </>
        ),
      }
  }
}

const quietButton =
  "inline-flex h-8 items-center rounded-[4px] border border-border px-3 text-sm font-medium transition-colors hover:border-[color-mix(in_oklab,var(--foreground)_28%,var(--border))] active:translate-y-px"

/**
 * What went wrong while loading the library (or rendering a page), inline in the page: an h1, one
 * sentence, the command in mono, Try again. `compact`: one line, for a small place.
 */
export function DataErrorNotice({
  error,
  onRetry,
  compact = false,
}: {
  error: unknown
  onRetry?: () => void
  compact?: boolean
}) {
  const { title, body, command } = explainError(error)
  const detail = isLibraryError(error) ? error.detail : undefined

  if (compact) {
    return <p className="px-4 py-1.5 text-sm text-muted-foreground">{title}.</p>
  }

  return (
    <Page width="glossed">
      <ErrorText role="alert" title={title} command={command}>
        {body}
      </ErrorText>
      <div className="mt-6 flex flex-wrap items-center gap-4">
        {onRetry ? (
          <button type="button" onClick={onRetry} className={quietButton}>
            Try again
          </button>
        ) : null}
      </div>
      {detail ? (
        <details className="mt-6 max-w-measure text-sm text-muted-foreground">
          <summary className="w-fit cursor-pointer rounded-[2px] select-none">Details</summary>
          <pre className="mt-2 max-h-64 overflow-auto bg-muted p-3 font-mono text-kbd whitespace-pre-wrap">
            {detail}
          </pre>
        </details>
      ) : null}
    </Page>
  )
}

/**
 * The shared shape of an error or a not-found page: the h1 in the serif title style, one sentence in
 * the measure, the command on a line of its own in mono.
 */
export function ErrorText({
  title,
  command,
  children,
  role,
  className,
}: {
  title: ReactNode
  command?: string
  children: ReactNode
  role?: "alert"
  className?: string
}) {
  return (
    <div role={role} className={cn("max-w-measure", className)}>
      <h1 className="title">{title}</h1>
      <p className="mt-3 font-serif text-read text-pretty">{children}</p>
      {command ? (
        <p className="mt-4">
          <code className="text-foreground">
            <span aria-hidden className="mr-2 text-muted-foreground select-none">
              $
            </span>
            {command}
          </code>
        </p>
      ) : null}
    </div>
  )
}
