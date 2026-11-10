"use client"

import { Suspense, type ReactNode } from "react"

import { reloadLibrary, useLibraryGeneration } from "@/lib/data"

import { ClientOnly } from "./client-only"
import { DataErrorNotice } from "./data-error"
import { ErrorBoundary } from "./error-boundary"

/**
 * Where data may be read. Everything that calls `useLibrary()` or `useSearchParams()` goes inside:
 *
 *   <LibraryBoundary fallback={<PageSkeleton variant="article" />}>
 *     <ArticleView />
 *   </LibraryBoundary>
 *
 * The static export renders `fallback` (the data only exists in the browser); the browser shows it
 * while the library loads, then the children. A failure shows what went wrong and a Retry that
 * fetches the library again.
 */
export function LibraryBoundary({
  children,
  fallback,
  errorDisplay = "notice",
  errorFallback,
  resetKeys,
}: {
  children: ReactNode
  fallback: ReactNode
  /** How a failure shows: the full notice (a page), one line (a sheet), or nothing (a count). */
  errorDisplay?: "notice" | "compact" | "silent"
  /** Rendered instead of any error display when given (a degraded view that needs no data). */
  errorFallback?: ReactNode
  /** Reset an error when one of these changes (a route's params). */
  resetKeys?: readonly unknown[]
}) {
  const generation = useLibraryGeneration()
  return (
    <ErrorBoundary
      resetKeys={[generation, ...(resetKeys ?? [])]}
      fallback={(error, reset) =>
        errorFallback !== undefined ? (
          errorFallback
        ) : errorDisplay === "silent" ? null : (
          <DataErrorNotice
            error={error}
            compact={errorDisplay === "compact"}
            onRetry={() => {
              reloadLibrary()
              reset()
            }}
          />
        )
      }
    >
      <Suspense fallback={fallback}>
        <ClientOnly fallback={fallback}>{children}</ClientOnly>
      </Suspense>
    </ErrorBoundary>
  )
}
