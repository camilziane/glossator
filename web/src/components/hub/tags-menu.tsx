"use client"

import { CheckIcon } from "lucide-react"
import { Fragment, useRef } from "react"

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"

import { type ArticleRow, type TagGroup } from "./model"
import { matchesTags } from "./table-features"
import { TAG_MODES, type TagMode } from "./url-state"
import { MenuButton } from "./view-options"

/**
 * How many articles each tag would keep, among the rows the other filters keep: with "all", the
 * articles having every chosen tag and this one; with "any", those having this one.
 */
export function tagCounts(
  rows: readonly Pick<ArticleRow, "tags">[],
  chosen: readonly string[],
  mode: TagMode
): Map<string, number> {
  const counts = new Map<string, number>()
  const base =
    mode === "all" ? rows.filter((r) => matchesTags(r.tags, { tags: chosen, mode })) : rows
  for (const row of base) for (const tag of row.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  return counts
}

/**
 * The Tags menu: the tags grouped by dimension (the columns they are written in; vague ones last),
 * each with how many articles it would keep, "match all · any" at the top, and a field to find one,
 * focused on opening (Enter toggles the first match). Choosing a tag toggles it.
 */
export function TagsMenu({
  groups,
  selected,
  mode,
  counts,
  onChange,
  onModeChange,
}: {
  groups: readonly TagGroup[]
  selected: readonly string[]
  mode: TagMode
  counts: ReadonlyMap<string, number>
  onChange: (tags: string[]) => void
  onModeChange: (mode: TagMode) => void
}) {
  const chosen = new Set(selected)
  const findRef = useRef<HTMLInputElement>(null)
  const toggle = (value: string) =>
    onChange(chosen.has(value) ? selected.filter((v) => v !== value) : [...selected, value])

  return (
    <Popover>
      <PopoverTrigger asChild>
        <MenuButton value={selected.length > 0 ? selected.length : undefined}>Tags</MenuButton>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-76 gap-0 p-0"
        // Typing finds a tag at once; Enter toggles the first match.
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          findRef.current?.focus()
        }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border py-1.5 pr-2 pl-4">
          <span id="hub-tag-mode" className="text-small text-muted-foreground">
            Articles with
          </span>
          <ToggleGroup
            type="single"
            size="sm"
            spacing={0}
            value={mode}
            onValueChange={(v) => {
              if ((TAG_MODES as readonly string[]).includes(v)) onModeChange(v as TagMode)
            }}
            aria-labelledby="hub-tag-mode"
          >
            <ToggleGroupItem value="all" className="focus-inset">
              all
            </ToggleGroupItem>
            <ToggleGroupItem value="any" className="focus-inset">
              any
            </ToggleGroupItem>
          </ToggleGroup>
          <span className="sr-only">of the chosen tags</span>
        </div>
        <Command>
          <CommandInput
            ref={findRef}
            placeholder="Find a tag"
            aria-label="Find a tag"
            className="h-10 text-sm"
          />
          <CommandList label="Tags" aria-multiselectable>
            <CommandEmpty className="py-4 text-sm">No tag has these words.</CommandEmpty>
            {groups.map((group, i) => (
              <Fragment key={group.label ?? i}>
                <CommandGroup heading={group.label ?? undefined}>
                  {group.tags.map((option) => {
                    const isChosen = chosen.has(option.value)
                    const count = counts.get(option.value) ?? 0
                    return (
                      <CommandItem
                        key={option.value}
                        value={`${group.label ?? ""} ${option.label}`}
                        keywords={[option.label]}
                        onSelect={() => toggle(option.value)}
                        aria-checked={isChosen}
                        className={cn(
                          "min-h-8 py-1.5",
                          count === 0 && !isChosen && "text-muted-foreground"
                        )}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            "flex size-3.5 shrink-0 items-center justify-center rounded-[3px] border",
                            isChosen
                              ? "border-foreground bg-foreground text-background [&_svg]:text-background!"
                              : "border-input [&_svg]:invisible"
                          )}
                        >
                          <CheckIcon className="size-2.5" />
                        </span>
                        <span className="min-w-0 flex-1 truncate">{option.label}</span>
                        <CommandShortcut className="pl-3 font-sans text-small tracking-normal num">
                          {count}
                        </CommandShortcut>
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              </Fragment>
            ))}
            {selected.length > 0 ? (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem onSelect={() => onChange([])}>Clear the tags</CommandItem>
                </CommandGroup>
              </>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
