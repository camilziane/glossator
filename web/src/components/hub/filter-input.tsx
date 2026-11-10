"use client"

import { XIcon } from "lucide-react"

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Kbd } from "@/components/ui/kbd"
import { cn } from "@/lib/utils"

/**
 * The filter field of a hub table: the page's filter (`data-page-filter`: the shell's "/" focuses
 * it). Escape clears it, then leaves it. No magnifier: the word says what it does.
 */
export function FilterInput({
  value,
  onChange,
  label,
  placeholder,
  className,
}: {
  value: string
  onChange: (value: string) => void
  label: string
  placeholder: string
  className?: string
}) {
  return (
    <InputGroup className={cn("h-8 bg-background", className)}>
      <InputGroupInput
        data-page-filter
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Escape") return
          if (value) onChange("")
          else e.currentTarget.blur()
          e.preventDefault()
        }}
        placeholder={placeholder}
        aria-label={label}
        aria-keyshortcuts="/"
        autoComplete="off"
        spellCheck={false}
        className="pl-2.5 [&::-webkit-search-cancel-button]:hidden"
      />
      <InputGroupAddon align="inline-end">
        {value ? (
          <InputGroupButton
            size="icon-xs"
            aria-label="Clear the filter"
            onClick={() => onChange("")}
          >
            <XIcon aria-hidden />
          </InputGroupButton>
        ) : (
          <Kbd aria-hidden hint>
            /
          </Kbd>
        )}
      </InputGroupAddon>
    </InputGroup>
  )
}
