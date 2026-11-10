"use client"

import "./globals.css"

import { useSyncExternalStore } from "react"

import { APP_NAME, commands } from "@/lib/site"

const noSubscription = () => () => {}

/** The theme the reader chose (next-themes keeps it in localStorage), applied without its provider. */
function readDark(): boolean {
  try {
    const chosen = window.localStorage.getItem("theme")
    if (chosen === "dark") return true
    if (chosen === "light") return false
  } catch {
    // Storage off: the system's choice.
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
}

/**
 * The last resort: the root layout itself failed. Its own document, no providers: an h1, one
 * sentence, the command, in the app's paper and serif.
 */
export default function GlobalError({ reset }: { error: unknown; reset: () => void }) {
  const dark = useSyncExternalStore(noSubscription, readDark, () => false)
  return (
    <html lang="en" className={dark ? "dark" : undefined}>
      <body className="min-h-svh bg-background px-4 pt-16 text-foreground sm:px-8">
        <title>{`The app stopped — ${APP_NAME}`}</title>
        <main className="mx-auto max-w-[34rem]">
          <h1 className="title">The app stopped</h1>
          <p className="mt-3 font-serif text-read text-pretty">
            An unexpected error stopped the page. Try again; if it happens again, rebuild the app
            and restart the server.
          </p>
          <p className="mt-4">
            <code>
              <span aria-hidden className="mr-2 text-muted-foreground select-none">
                $
              </span>
              {commands.serve}
            </code>
          </p>
          <button
            type="button"
            onClick={reset}
            className="mt-6 inline-flex h-8 items-center rounded-[4px] border border-border px-3 font-sans text-sm font-medium"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  )
}
