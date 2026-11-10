"use client"

import { cn } from "@/lib/utils"

import { CopyButton } from "./copy-button"

/**
 * A shell command to type (from `commands` in @/lib/site), in the mono on the wash, with a control
 * that copies it (its icon turns to a check for a moment; no toast): empty states, the inbox without
 * its API, notices.
 */
export function CliCommand({
  command,
  className,
  tabIndex,
}: {
  command: string
  className?: string
  /** For a roving tabindex in lists (-1 outside the current item). */
  tabIndex?: number
}) {
  return (
    <span
      className={cn(
        "relative z-10 inline-flex max-w-full min-w-0 items-center gap-0.5 rounded-lg bg-muted py-px pr-px pl-2 align-middle text-foreground",
        className
      )}
    >
      <code className="min-w-0 truncate font-mono text-kbd select-all" title={command}>
        {command}
      </code>
      <CopyButton
        value={command}
        iconOnly
        size="icon-xs"
        tabIndex={tabIndex}
        accessibleLabel={(state) =>
          state === "copied"
            ? `Copied: ${command}`
            : state === "failed"
              ? `Could not copy: ${command}`
              : `Copy: ${command}`
        }
        className="text-muted-foreground hover:bg-[color-mix(in_oklab,var(--muted),var(--foreground)_6%)] hover:text-foreground data-[copy-state=copied]:text-success"
      />
    </span>
  )
}

/** A command named in running text (no copy control): the mono on the wash, wraps anywhere. */
export function InlineCommand({ children, className }: { children: string; className?: string }) {
  return (
    <code
      className={cn(
        "rounded-lg bg-muted box-decoration-clone px-1.5 py-0.5 mono [overflow-wrap:anywhere] text-foreground",
        className
      )}
    >
      {children}
    </code>
  )
}
