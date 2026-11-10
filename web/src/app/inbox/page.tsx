// Route "/inbox/" — owned by the inbox engineer. The LibraryBoundary stays.
import type { Metadata } from "next"

import { InboxView } from "@/components/inbox/inbox-view"
import { LibraryBoundary } from "@/components/shell/library-boundary"
import { PageSkeleton } from "@/components/shell/page-skeleton"

export const metadata: Metadata = { title: "Inbox" }

export default function InboxPage() {
  return (
    <LibraryBoundary fallback={<PageSkeleton variant="inbox" />}>
      <InboxView />
    </LibraryBoundary>
  )
}
