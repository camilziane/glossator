"use client"

import { createContext, useContext } from "react"

import type { ArticleEntry } from "@/lib/data"
import type { CiteCard } from "@/lib/cite"

/** What the blocks of an article need from the page: its PDF, its card, its library, its lightbox. */
export interface ArticleContextValue {
  /** The article's PDF (pages cited open it there), or null. */
  pdf: string | null
  /** The article's card: copied quotes and metrics carry its citation. */
  card: CiteCard | null
  /** The PDF is a manuscript: a copied citation says "PDF p. 5". */
  manuscript: boolean
  /** Another article of the library, for the card an in-collection link shows. */
  lookup: ((bib: string, key: string) => ArticleEntry | undefined) | null
  /** Open a figure (its image's URL) in the lightbox. */
  openFigure: ((src: string) => void) | null
}

const DEFAULT: ArticleContextValue = {
  pdf: null,
  card: null,
  manuscript: false,
  lookup: null,
  openFigure: null,
}

const ArticleContext = createContext<ArticleContextValue>(DEFAULT)

export const ArticleProvider = ArticleContext.Provider

export function useArticleContext(): ArticleContextValue {
  return useContext(ArticleContext)
}
