// Route "/": Today, what changed. The view reads the data, so it sits in a LibraryBoundary whose
// fallback (also what the static export holds) has the page's own grid.
import type { Metadata } from "next"

import { TodayView } from "@/components/overview/today-view"
import { LibraryBoundary } from "@/components/shell/library-boundary"
import { PageSkeleton } from "@/components/shell/page-skeleton"
import { APP_NAME } from "@/lib/site"

// The root layout's title template applies to child segments only, not to its own page.
export const metadata: Metadata = {
  title: { absolute: `Today — ${APP_NAME}` },
}

export default function TodayPage() {
  return (
    <LibraryBoundary fallback={<PageSkeleton variant="today" />}>
      <TodayView />
    </LibraryBoundary>
  )
}
