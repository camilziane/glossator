// Route "/article/?b=<bib>&k=<key>" (sections as #<section-id>) — owned by the article engineer.
import type { Metadata } from "next"

import { ArticleView } from "@/components/article/article-view"
import { LibraryBoundary } from "@/components/shell/library-boundary"
import { PageSkeleton } from "@/components/shell/page-skeleton"

export const metadata: Metadata = { title: "Article" }

export default function ArticlePage() {
  return (
    <LibraryBoundary fallback={<PageSkeleton variant="article" />}>
      <ArticleView />
    </LibraryBoundary>
  )
}
