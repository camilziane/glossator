"use client"

import { CheckIcon, CopyIcon, XIcon } from "lucide-react"
import { useEffect, useState, type ComponentProps, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { copyText } from "@/lib/clipboard"
import { cn } from "@/lib/utils"

export type CopyState = "idle" | "copied" | "failed"

/** How long "Copied" stays before the control reads "Copy" again. */
export const COPIED_MS = 1200

/**
 * Copy text and say so for a moment: `copy(text)` returns whether it worked; `state` is "copied" (or
 * "failed") for 1.2 s, then "idle" again. For controls of one's own (a menu item, a key).
 */
export function useCopy(): { state: CopyState; copy: (text: string) => Promise<boolean> } {
  const [state, setState] = useState<CopyState>("idle")
  const [stamp, setStamp] = useState(0)
  useEffect(() => {
    if (state === "idle") return
    const t = window.setTimeout(() => setState("idle"), state === "failed" ? 2400 : COPIED_MS)
    return () => window.clearTimeout(t)
  }, [state, stamp])
  async function copy(text: string): Promise<boolean> {
    const ok = await copyText(text)
    setState(ok ? "copied" : "failed")
    setStamp((n) => n + 1)
    return ok
  }
  return { state, copy }
}

/**
 * A control that copies a text and says so in place: no toast. Its icon crossfades to a check and its
 * label to "Copied" (120 ms), then back after 1.2 s; screen readers hear "Copied" once. If the browser
 * refuses, it says "Not copied" for a little longer.
 *
 * ```tsx
 * <CopyButton value={bibtex(card)} label="BibTeX" what="the BibTeX entry" />
 * <CopyButton value={card.key} iconOnly what={`the key ${card.key}`} />
 * ```
 */
export function CopyButton({
  value,
  label = "Copy",
  copiedLabel = "Copied",
  what,
  iconOnly = false,
  keyHint,
  accessibleLabel,
  onCopied,
  variant = "ghost",
  size,
  className,
  children,
  ...props
}: Omit<ComponentProps<typeof Button>, "value" | "onClick" | "children"> & {
  /** The text to copy, or a function giving it at the moment of the click. */
  value: string | (() => string)
  /** The visible label ("Copy", "BibTeX"); ignored with `iconOnly`. */
  label?: ReactNode
  copiedLabel?: ReactNode
  /** What is copied, for screen readers: "Copy the citation key". */
  what?: string
  /** Only the icon (the accessible name says the rest). */
  iconOnly?: boolean
  /** A keyboard hint after the label ("y"), hidden on touch screens. */
  keyHint?: string
  /** The accessible name in each state (by default "Copy {what}" / "Copied {what}"). */
  accessibleLabel?: (state: CopyState) => string
  onCopied?: (text: string) => void
  /** Content after the label (a preview of what is copied). */
  children?: ReactNode
}) {
  const { state, copy } = useCopy()
  const name =
    accessibleLabel?.(state) ??
    (what
      ? `${state === "copied" ? "Copied" : state === "failed" ? "Could not copy" : "Copy"} ${what}`
      : iconOnly
        ? state === "copied"
          ? "Copied"
          : "Copy"
        : undefined)

  async function onClick() {
    const text = typeof value === "function" ? value() : value
    if (await copy(text)) onCopied?.(text)
  }

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size ?? (iconOnly ? "icon-sm" : "sm")}
        data-copy-state={state}
        aria-label={name}
        onClick={() => void onClick()}
        className={cn(state === "failed" && "text-danger", className)}
        {...props}
      >
        <span
          aria-hidden="true"
          className="relative inline-grid size-4 shrink-0 [&>svg]:col-start-1 [&>svg]:row-start-1 [&>svg]:size-full [&>svg]:transition-opacity [&>svg]:duration-[120ms]"
        >
          <CopyIcon className={cn(state !== "idle" && "opacity-0")} />
          <CheckIcon className={cn(state !== "copied" && "opacity-0")} />
          <XIcon className={cn(state !== "failed" && "opacity-0")} />
        </span>
        {iconOnly ? null : (
          // Both labels share one cell: the button keeps the width of the longer one.
          <span className="inline-grid [&>span]:col-start-1 [&>span]:row-start-1 [&>span]:transition-opacity [&>span]:duration-[120ms]">
            <span className={cn(state !== "idle" && "opacity-0")}>{label}</span>
            <span aria-hidden={state === "idle"} className={cn(state === "idle" && "opacity-0")}>
              {state === "failed" ? "Not copied" : copiedLabel}
            </span>
          </span>
        )}
        {children}
        {keyHint && !iconOnly ? (
          <Kbd hint className="ml-0.5">
            {keyHint}
          </Kbd>
        ) : null}
      </Button>
      <span role="status" className="sr-only">
        {state === "copied"
          ? `Copied${what ? ` ${what}` : ""}`
          : state === "failed"
            ? "Could not copy: select the text and copy it by hand"
            : ""}
      </span>
    </>
  )
}
