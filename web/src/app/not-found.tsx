// The 404 page (out/404.html: glossator serve answers every unknown path with it).
import type { Metadata } from "next"

import { NotFoundView } from "@/components/overview/not-found-view"
import { TODAY_PAGE_WIDTH } from "@/components/overview/today-grid"
import { Page } from "@/components/shell/page"
import { APP_NAME } from "@/lib/site"

// The root layout's title template applies to child segments only, not to its own files.
export const metadata: Metadata = {
  title: { absolute: `Page not found — ${APP_NAME}` },
}

export default function NotFound() {
  return (
    <Page width={TODAY_PAGE_WIDTH}>
      <NotFoundView />
    </Page>
  )
}
