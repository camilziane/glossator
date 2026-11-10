// Route "/search/?q=" — owned by the search engineer. The LibraryBoundary stays.
import type { Metadata } from "next"

import { SearchView } from "@/components/search/search-view"
import { LibraryBoundary } from "@/components/shell/library-boundary"
import { PageSkeleton } from "@/components/shell/page-skeleton"

export const metadata: Metadata = { title: "Search" }

export default function SearchPage() {
  return (
    <LibraryBoundary fallback={<PageSkeleton variant="search" />}>
      <SearchView />
    </LibraryBoundary>
  )
}
