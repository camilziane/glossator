"use client"

import { DataErrorNotice } from "@/components/shell/data-error"
import { reloadLibrary } from "@/lib/data"

/** A page that failed while rendering: say what happened, offer to try again. */
export default function RouteError({ error, reset }: { error: unknown; reset: () => void }) {
  return (
    <DataErrorNotice
      error={error}
      onRetry={() => {
        reloadLibrary()
        reset()
      }}
    />
  )
}
