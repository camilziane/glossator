"use client"

import { ChevronDownIcon, XIcon } from "lucide-react"
import type { KeyboardEvent, ReactNode, RefObject } from "react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useIsMobile } from "@/hooks/use-mobile"
import type { Bibliography } from "@/lib/data"
import type { SearchMode, SearchScope } from "@/lib/routes"
import { cn } from "@/lib/utils"

interface Choice<T extends string> {
  value: T
  /** As the sentence says it ("Words and meaning", "everything"). */
  label: string
  hint: string
}

export const MODES: readonly Choice<SearchMode>[] = [
  {
    value: "hybrid",
    label: "Words and meaning",
    hint: "Passages with the words, and passages that say the same in other words",
  },
  { value: "keyword", label: "Words", hint: "Passages with the words themselves" },
  { value: "semantic", label: "Meaning", hint: "Passages close in meaning, even in other words" },
]

export const SCOPES: readonly Choice<SearchScope>[] = [
  {
    value: "all",
    label: "everything",
    hint: "The papers, their supplementary files and the summaries",
  },
  { value: "text", label: "the papers", hint: "The PDFs and the supplementary files" },
  { value: "records", label: "the summaries", hint: "The articles’ summaries: metrics, methods…" },
]

const ALL_BIBS = "__all__"

export const SEARCH_INPUT_ID = "search-q"

/**
 * One of the sentence's words: a text menu ("everything ▾") that names its choice and lists the
 * others with what each does.
 */
function TextMenu<T extends string>({
  name,
  value,
  choices,
  onChange,
}: {
  /** What the menu sets, for screen readers ("Match", "Search in"). */
  name: string
  value: T
  choices: readonly Choice<T>[]
  onChange: (value: T) => void
}) {
  const chosen = choices.find((c) => c.value === value) ?? choices[0]
  return (
    // Not modal: a small menu in a sentence leaves the page as it is (no aria-hidden around it).
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`${name}: ${chosen?.label ?? ""}`}
          className="relative -mx-1 inline-flex items-baseline gap-0.5 rounded-[4px] px-1 font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-offset-0 aria-expanded:bg-muted pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:-inset-y-2.5 pointer-coarse:after:content-['']"
        >
          {chosen?.label}
          <ChevronDownIcon
            aria-hidden
            className="size-3.5 translate-y-[0.15em] text-muted-foreground"
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-auto max-w-[min(22rem,calc(100vw-2rem))]">
        <DropdownMenuRadioGroup value={value} onValueChange={(v) => onChange(v as T)}>
          {choices.map((c) => (
            <DropdownMenuRadioItem
              key={c.value}
              value={c.value}
              className="items-start py-2 pointer-coarse:min-h-11"
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-medium first-letter:uppercase">{c.label}</span>
                <span className="text-small text-pretty text-muted-foreground">{c.hint}</span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * The search's field (sans 17, the page's filter: `/` comes back to it) and its filters as one
 * sentence of text menus: "Words and meaning ▾ in everything ▾ from every bibliography ▾". `busy`
 * draws a 2 px indeterminate line under the field while an answer is on its way; `status` sits at
 * the end of the sentence (the count of what was found).
 */
export function SearchControls({
  inputRef,
  q,
  mode,
  scope,
  bib,
  bibliographies,
  busy,
  status,
  onQuery,
  onSubmit,
  onMode,
  onScope,
  onBib,
  onInputKeyDown,
}: {
  inputRef: RefObject<HTMLInputElement | null>
  q: string
  mode: SearchMode
  scope: SearchScope
  bib: string
  bibliographies: readonly Bibliography[]
  busy: boolean
  status?: ReactNode
  onQuery: (q: string) => void
  onSubmit: () => void
  onMode: (mode: SearchMode) => void
  onScope: (scope: SearchScope) => void
  onBib: (bib: string) => void
  onInputKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void
}) {
  // The placeholder fits the field: a phone's is shorter.
  const phone = useIsMobile()
  const bibChoices: Choice<string>[] = [
    { value: ALL_BIBS, label: "every bibliography", hint: "All the library" },
    ...bibliographies.map((b) => ({
      value: b.name,
      label: b.short || b.title || b.name,
      hint: b.title && b.title !== b.short ? b.title : b.name,
    })),
  ]
  return (
    <form
      role="search"
      aria-label="Full-text search"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      <div className="relative">
        <label htmlFor={SEARCH_INPUT_ID} className="sr-only">
          Search the papers
        </label>
        <input
          ref={inputRef}
          data-page-filter
          id={SEARCH_INPUT_ID}
          type="search"
          value={q}
          onChange={(e) => onQuery(e.target.value)}
          onKeyDown={onInputKeyDown}
          placeholder={
            phone ? "Search the papers" : "Search the papers, their files and the summaries"
          }
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          aria-keyshortcuts="/"
          aria-describedby="search-status"
          className="h-11 w-full rounded-[4px] border border-input bg-transparent pr-11 pl-3 font-sans text-read leading-6 text-foreground transition-[border-color] duration-150 placeholder:text-muted-foreground hover:border-foreground/45 focus-visible:outline-offset-[-1px] [&::-webkit-search-cancel-button]:appearance-none"
        />
        {q ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Clear the search"
            onClick={() => {
              onQuery("")
              inputRef.current?.focus()
            }}
            className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <XIcon />
          </Button>
        ) : null}
        {/* While an answer is on its way: a 2 px line under the field, no spinner. */}
        <div
          aria-hidden
          data-busy={busy || undefined}
          className={cn(
            "pointer-events-none absolute inset-x-px bottom-px h-0.5 overflow-hidden rounded-b-[3px] transition-opacity duration-150",
            busy ? "opacity-100" : "opacity-0"
          )}
        >
          {busy ? (
            <div className="h-full w-full origin-left animate-indeterminate bg-foreground/55" />
          ) : null}
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap items-baseline gap-x-6 gap-y-1.5">
        <p className="min-w-0 text-ui leading-6 text-muted-foreground">
          <TextMenu name="Match" value={mode} choices={MODES} onChange={onMode} /> in{" "}
          <TextMenu name="Search in" value={scope} choices={SCOPES} onChange={onScope} />
          {bibliographies.length > 1 ? (
            <>
              {" "}
              from{" "}
              <TextMenu
                name="Bibliography"
                value={bib || ALL_BIBS}
                choices={bibChoices}
                onChange={(v) => onBib(v === ALL_BIBS ? "" : v)}
              />
            </>
          ) : null}
        </p>
        {status}
      </div>
    </form>
  )
}
