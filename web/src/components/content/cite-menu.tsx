"use client"

import { CheckIcon, ChevronDownIcon, XIcon } from "lucide-react"
import { useState, type ComponentProps, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Kbd } from "@/components/ui/kbd"
import { bibtex, citePlace, formatReference, type CiteCard, type CitePlace } from "@/lib/cite"
import { cn } from "@/lib/utils"

import { FullReferenceText } from "./cite"
import { useCopy } from "./copy-button"

type Format = "key" | "latex" | "bibtex" | "reference"

const WHAT: Record<Format, string> = {
  key: "the citation key",
  latex: "the LaTeX citation",
  bibtex: "the BibTeX entry",
  reference: "the reference",
}

/**
 * The Cite menu of an article: its key, its `\cite` (at a place, by `citePlace`'s rule: the journal
 * page, or a comment naming the PDF or manuscript page, or the supplementary file), its BibTeX entry
 * (every author, volume, number, pages) and its full reference. Choosing one copies it; the trigger says
 * "Copied" for a moment (no toast) and screen readers hear what was copied.
 *
 * The page opens it with its own key (`c`): pass `open` and `onOpenChange`, and `keyHint="c"` to show
 * the key on the trigger (hidden on touch screens).
 *
 * ```tsx
 * <CiteMenu card={article} keyHint="c" open={citeOpen} onOpenChange={setCiteOpen} />
 * <CiteMenu card={article} place={{ page: 5 }} />               // \cite{key} % PDF p. 5 …
 * <CiteMenu card={article} place={{ page: 2, file: "SI 1" }} />  // \cite[SI~1, p.~2]{key}
 * ```
 */
export function CiteMenu({
  card,
  place,
  open,
  onOpenChange,
  keyHint,
  align = "start",
  label = "Cite",
  className,
  ...triggerProps
}: Omit<ComponentProps<typeof Button>, "children"> & {
  card: CiteCard
  /** Where the LaTeX citation points (a page of the PDF or of a supplementary file). */
  place?: CitePlace | null
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** The page's key for the menu, shown on the trigger. */
  keyHint?: string
  align?: "start" | "center" | "end"
  /** The trigger's word. */
  label?: ReactNode
}) {
  const { state, copy } = useCopy()
  const [last, setLast] = useState<Format>("key")

  const texts: Record<Format, string> = {
    key: card.key,
    latex: citePlace(card, place).latex,
    bibtex: bibtex(card),
    reference: formatReference(card),
  }

  function choose(format: Format) {
    setLast(format)
    void copy(texts[format])
  }

  return (
    <>
      <DropdownMenu open={open} onOpenChange={onOpenChange}>
        <DropdownMenuTrigger asChild>
          <Button
            data-copy-state={state}
            aria-keyshortcuts={keyHint}
            className={cn(state === "failed" && "text-danger", className)}
            {...triggerProps}
          >
            {/*
              The word (and its key) and "Copied" share one cell, sized by the word alone (the
              second is a container of no width of its own): the trigger keeps its width, and the
              state's word shows only where it fits ("Cite" says ✓ alone).
            */}
            <span className="inline-grid [&>span]:col-start-1 [&>span]:row-start-1 [&>span]:transition-opacity [&>span]:duration-[120ms]">
              <span
                className={cn("inline-flex items-center gap-1.5", state !== "idle" && "opacity-0")}
              >
                {label}
                {keyHint ? <Kbd hint>{keyHint}</Kbd> : null}
              </span>
              <span
                aria-hidden
                className={cn(
                  "@container flex items-center justify-center",
                  state === "idle" && "opacity-0"
                )}
              >
                <span className="inline-flex items-center gap-1 whitespace-nowrap">
                  {state === "failed" ? (
                    <>
                      <XIcon className="size-3.5 shrink-0" />
                      <span className="hidden @min-[5.25rem]:inline">Not copied</span>
                    </>
                  ) : (
                    <>
                      <CheckIcon className="size-3.5 shrink-0" />
                      <span className="hidden @min-[3.875rem]:inline">Copied</span>
                    </>
                  )}
                </span>
              </span>
            </span>
            <ChevronDownIcon aria-hidden className="-mr-1 size-3.5 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align={align}
          className="w-auto max-w-[min(30rem,calc(100vw-2rem))] min-w-72"
        >
          <Item format="key" label="Key" onChoose={choose}>
            <code className="font-mono text-kbd">{texts.key}</code>
          </Item>
          <Item format="latex" label="LaTeX" onChoose={choose}>
            <code className="font-mono text-kbd">{texts.latex}</code>
          </Item>
          <Item format="bibtex" label="BibTeX" onChoose={choose}>
            <code className="block truncate font-mono text-kbd text-muted-foreground">
              {texts.bibtex.split("\n")[0]} …
            </code>
          </Item>
          <Item format="reference" label="Reference" onChoose={choose}>
            <FullReferenceText card={card} className="font-serif text-ui" />
          </Item>
        </DropdownMenuContent>
      </DropdownMenu>
      <span role="status" className="sr-only">
        {state === "copied"
          ? `Copied ${WHAT[last]}`
          : state === "failed"
            ? `Could not copy ${WHAT[last]}`
            : ""}
      </span>
    </>
  )
}

function Item({
  format,
  label,
  onChoose,
  children,
}: {
  format: Format
  label: string
  onChoose: (format: Format) => void
  children: ReactNode
}) {
  return (
    <DropdownMenuItem
      onSelect={() => onChoose(format)}
      className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-x-3"
      aria-label={`Copy ${WHAT[format]}`}
    >
      <span className="label">{label}</span>
      <span className="min-w-0">{children}</span>
    </DropdownMenuItem>
  )
}
