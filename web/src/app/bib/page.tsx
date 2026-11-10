// Route "/bib/?b=<name>" — owned by the hub engineer. The LibraryBoundary stays.
import type { Metadata } from "next"

import { BibView } from "@/components/hub/bib-view"
import { LibraryBoundary } from "@/components/shell/library-boundary"
import { PageSkeleton } from "@/components/shell/page-skeleton"

export const metadata: Metadata = { title: "Bibliography" }

export default function BibPage() {
  return (
    <LibraryBoundary fallback={<PageSkeleton variant="hub" />}>
      <BibView />
    </LibraryBoundary>
  )
}
